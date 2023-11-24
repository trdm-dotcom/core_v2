import { Inject, Service } from 'typedi';
import IPostRequest from '../models/request/IPostRequest';
import Post from '../models/entities/Post';
import { Errors, Logger, Utils } from 'common';
import * as utils from '../utils/Utils';
import IDeletePostRequest from '../models/request/IDeletePostRequest';
import { MongoRepository } from 'typeorm';
import CacheService from './CacheService';
import Constants from '../Constants';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { FirebaseType } from 'common/build/src/modules/models';
import { IReactionRequest } from '../models/request/IReactionRequest';
import RedisService from './RedisService';
import { ICommentRequest } from '../models/request/ICommentRequest';
import Reaction from '../models/entities/Reaction';
import Comment from '../models/entities/Comment';
import { IPostCommentReactionRequest } from '../models/request/IPostCommentReactionRequest';
import { IMessage } from 'kafka-common/build/src/modules/kafka';
import { getInstance } from './KafkaProducerService';
import { Kafka } from 'kafka-common';
import { ObjectID } from 'mongodb';
import * as twitter from 'twitter-text';

@Service()
export default class PostService {
  @Inject()
  private cacheService: CacheService;
  @Inject()
  private redisService: RedisService;
  @InjectRepository(Post)
  private postRepository: MongoRepository<Post>;

  public async store(request: IPostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.source, 'source').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'UP_POST');
    const imageModeration = await getInstance().sendRequestAsync(
      `${transactionId}`,
      'content-moderation',
      'post:/api/v1/moderation/image',
      {
        imageData: request.source.replace(/^data:image\/\w+;base64,/, ''),
        filename: 'image.jpg',
      }
    );
    const imageModerationResult = Kafka.getResponse<any>(imageModeration);
    Logger.info(`${transactionId} imageModeration`, imageModerationResult);
    let caption = request.caption;
    const mentions: Set<number> = new Set();
    const hashtags: Set<string> = new Set();
    if (caption != null) {
      caption = this.sanitise(caption);
      const textModeration = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'content-moderation',
        'post:/api/v1/moderation/text',
        {
          text: caption,
          mode: 'ml',
        }
      );
      const textModerationResult = Kafka.getResponse<any>(textModeration);
      Logger.info(`${transactionId} textModeration`, textModerationResult);
      const extractHashtags = twitter.extractHashtags(caption).toLocaleString().toLowerCase();
      if (extractHashtags.length > 0) {
        extractHashtags.split(',').forEach((element) => {
          hashtags.add(element);
        });
      }
      const extractMentions = this.extractUserStrings(caption).toLocaleString().toLowerCase();
      if (extractMentions.length > 0) {
        extractMentions.split(',').forEach((element) => {
          const mentionUserId = this.extractMentionUserId(element);
          if (mentionUserId != null) {
            mentions.add(mentionUserId);
          }
        });
      }
    }
    const post: Post = new Post();
    post.userId = request.headers.token.userData.id;
    post.disable = false;
    post.source = request.source;
    post.tags = request.tags;
    post.caption = caption;
    post.mentions = Array.from(mentions.values());
    post.hashtags = Array.from(hashtags.values());
    post.reactions = [];
    post.comments = [];
    await this.postRepository.save(post);
    const PromiseArray: Promise<any>[] = [];
    if (request.tags) {
      request.tags.forEach((tag) => {
        PromiseArray.push(
          new Promise((resolve) => {
            utils.sendMessagePushNotification(
              `${transactionId}`,
              tag,
              `${request.headers.token.userData.name} tag you on post`,
              'push_up',
              FirebaseType.TOKEN,
              true,
              null,
              'TAG',
              post.id.toHexString(),
              request.headers.token.userData.id
            );
            resolve(null);
          })
        );
      });
    }
    if (mentions.size > 0) {
      mentions.forEach((mention) => {
        PromiseArray.push(
          new Promise((resolve) => {
            utils.sendMessagePushNotification(
              `${transactionId}`,
              mention,
              `${request.headers.token.userData.name} mention you on post`,
              'push_up',
              FirebaseType.TOKEN,
              true,
              null,
              'MENTION_ON_POST',
              post.id.toHexString(),
              request.headers.token.userData.id
            );
            resolve(null);
          })
        );
      });
    }
    Promise.all(PromiseArray);
    return {};
  }

  public async delete(request: IDeletePostRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.post, 'post').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'DELETE_POST');
    const userId = request.headers.token.userData.id;
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.post),
        userId: userId,
      },
    });
    try {
      while (await this.cacheService.findInprogessValidate(request.post, 'DELETE_DISABLE_POST', transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(request.post, 'DELETE_DISABLE_POST', transactionId);
      if (post == null) {
        throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
      }
      if (post.userId != userId) {
        throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
      }
      await this.postRepository.delete(post.id);
      this.publish(
        'post.deleteOrDisable',
        {
          to: post.id.toHexString(),
        },
        sourceId
      );
    } finally {
      this.cacheService.removeInprogessValidate(request.post, 'DELETE_DISABLE_POST', transactionId);
    }
    return {};
  }

  public async disable(request: IDeletePostRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.post, 'post').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    Utils.validate(request.disable, 'disable').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'DISABLE_POST');
    const userId = request.headers.token.userData.id;
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.post),
        userId: userId,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    try {
      while (await this.cacheService.findInprogessValidate(request.post, 'DELETE_DISABLE_POST', transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(request.post, 'DELETE_DISABLE_POST', transactionId);
      if (post.userId != userId) {
        throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
      }
      await this.postRepository.updateOne(
        {
          _id: new ObjectID(request.post),
        },
        { disable: request.disable }
      );
      this.publish(
        'post.deleteOrDisable',
        {
          data: {
            id: post.id.toHexString(),
          },
        },
        sourceId
      );
    } finally {
      this.cacheService.removeInprogessValidate(request.post, 'DELETE_DISABLE_POST', transactionId);
    }
    return {};
  }

  public async update(request: IPostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.post, 'post').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'UPDATE_POST');
    const userId = request.headers.token.userData.id;
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.post),
        userId: userId,
      },
    });
    try {
      while (
        (await this.cacheService.findInprogessValidate(request.post, 'DELETE_DISABLE_POST', transactionId)) ||
        (await this.cacheService.findInprogessValidate(request.post, 'MODIFY_POST', transactionId))
      ) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(request.post, 'MODIFY_POST', transactionId);
      if (post == null) {
        throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
      }
      if (post.userId != userId) {
        throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
      }
      let caption = request.caption;
      const mentions: Set<number> = new Set(post.mentions ? post.mentions : []);
      const hashtags: Set<string> = new Set(post.hashtags ? post.hashtags : []);
      if (caption != null && caption != post.caption) {
        caption = this.sanitise(caption);
        const textModeration = await getInstance().sendRequestAsync(
          `${transactionId}`,
          'content-moderation',
          'post:/api/v1/moderation/text',
          {
            text: caption,
            mode: 'ml',
          }
        );
        const textModerationResult = Kafka.getResponse<any>(textModeration);
        Logger.info(`${transactionId} textModeration`, textModerationResult);
        const extractHashtags = twitter.extractHashtags(caption).toLocaleString().toLowerCase();
        if (extractHashtags.length > 0) {
          extractHashtags.split(',').forEach((element) => {
            hashtags.add(element);
          });
        }
        const extractMentions = this.extractUserStrings(caption).toLocaleString().toLowerCase();
        if (extractMentions.length > 0) {
          extractMentions.split(',').forEach((element) => {
            const mentionUserId = this.extractMentionUserId(element);
            if (mentionUserId != null) {
              mentions.add(mentionUserId);
            }
          });
        }
      } else {
        mentions.clear();
        hashtags.clear();
      }
      await this.postRepository.update(post.id, {
        caption: caption,
        mentions: Array.from(mentions.values()),
        hashtags: Array.from(hashtags.values()),
        tags: request.tags,
      });
      const PromiseArray: Promise<any>[] = [];
      Array.from(mentions.values())
        .filter((mention) => !post.mentions.includes(mention))
        .forEach((mention) => {
          PromiseArray.push(
            new Promise((resolve) => {
              utils.sendMessagePushNotification(
                `${transactionId}`,
                mention,
                `${request.headers.token.userData.name} mention you on post`,
                'push_up',
                FirebaseType.TOKEN,
                true,
                null,
                'MENTION_ON_POST',
                post.id.toHexString(),
                request.headers.token.userData.id
              );
              resolve(null);
            })
          );
        });
      Promise.all(PromiseArray);
    } finally {
      this.cacheService.removeInprogessValidate(request.post, 'MODIFY_POST', transactionId);
    }
    return {};
  }

  public async get(request: IPostRequest, transactionId: string | number) {
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const userId = request.headers.token.userData.id;
    try {
      const getFriendRequest = {
        headers: request.headers,
      };
      const getFriendResponse: IMessage = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'user',
        'internal:/api/v1/user/friend',
        getFriendRequest
      );
      const friendsData = Kafka.getResponse<any[]>(getFriendResponse);
      const setUserIds: Set<number> = new Set([userId]);
      const mapUsers: Map<number, any> = new Map();
      friendsData.forEach((friend) => {
        setUserIds.add(friend.id);
        mapUsers.set(friend.id, friend);
      });
      const posts: Post[] = await this.postRepository.find({
        where: {
          userId: { $in: Array.from(setUserIds) },
          disable: false,
        },
        order: {
          createdAt: 'DESC',
        },
        skip: offset,
        take: limit,
      });
      const total: number = await this.postRepository.count({
        userId: { $in: Array.from(setUserIds) },
        disable: false,
      });
      posts.forEach((post) => {
        if (post.tags != null) {
          post.tags.forEach((element) => {
            setUserIds.add(element);
          });
        }
      });
      const datas: any[] = [];
      posts.forEach((post: Post) => {
        const author = mapUsers.get(post.userId);
        if (author && author.status == 'ACTIVE') {
          const tags: any[] = [];
          if (post.tags) {
            post.tags.forEach((tag) => {
              const tagUserInfo = mapUsers.get(tag);
              if (tagUserInfo && tagUserInfo.status === 'ACTIVE') {
                tags.push({
                  id: tag,
                  name: tagUserInfo.name,
                  avatar: tagUserInfo.avatar,
                });
              }
            });
          }
          datas.push({
            id: post.id,
            source: post.source,
            author: {
              name: author?.name,
              avatar: author?.avatar,
              userId: post.userId,
            },
            tags: tags,
            caption: post.caption,
            createdAt: post.createdAt,
            reactions: post.reactions ? post.reactions.map((reaction) => reaction.userId) : [],
            comments: post.comments ? post.comments.map((comment) => comment.userId) : [],
          });
        }
      });
      const response = {
        total: total,
        datas: datas,
        page: Number(request.pageNumber),
        totalPages: Math.ceil(total / limit),
      };
      return response;
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      return {
        total: 0,
        datas: [],
        page: 0,
        totalPages: 0,
      };
    }
  }

  async getPostByTag(request: IPostRequest, transactionId: string | number) {
    const userId = request.targetId != null ? request.targetId : request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const posts: Post[] = await this.postRepository.find({
      where: {
        tags: { $in: [Number(userId)] },
        disable: false,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: offset,
      take: limit,
    });
    const total: number = await this.postRepository.count({
      tags: { $in: [Number(userId)] },
      disable: false,
    });
    const post = posts.map((post: Post) => {
      return {
        id: post.id,
        source: post.source,
        userId: post.userId,
      };
    });
    return {
      total: total,
      datas: post,
      page: Number(request.pageNumber),
      totalPages: Math.ceil(total / limit),
    };
  }

  async getHidePost(request: IPostRequest, transactionId: string | number) {
    const userId = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const posts: Post[] = await this.postRepository.find({
      where: {
        userId: Number(userId),
        disable: true,
      },
      order: {
        updatedAt: 'DESC',
      },
      skip: offset,
      take: limit,
    });
    const total: number = await this.postRepository.count({
      userId: Number(userId),
      disable: true,
    });
    const post = posts.map((post: Post) => {
      return {
        id: post.id,
        source: post.source,
        userId: post.userId,
      };
    });
    return {
      total: total,
      datas: post,
      page: Number(request.pageNumber),
      totalPages: Math.ceil(total / limit),
    };
  }

  public async getPostOfUser(request: IPostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.targetId, 'targetId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const posts: Post[] = await this.postRepository.find({
      where: {
        userId: Number(request.targetId),
        disable: false,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: offset,
      take: limit,
    });
    const total: number = await this.postRepository.count({
      userId: Number(request.targetId),
      disable: false,
    });
    const post = posts.map((post: Post) => {
      return {
        id: post.id,
        source: post.source,
        userId: post.userId,
      };
    });
    return {
      total: total,
      datas: post,
      page: Number(request.pageNumber),
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDetail(request: IPostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.post, 'post').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.post),
        disable: false,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    try {
      const userIds: Set<number> = new Set([post.userId]);
      if (post.tags != null) {
        post.tags.forEach((element) => {
          userIds.add(element);
        });
      }
      if (post.comments != null) {
        post.comments.forEach((element) => {
          userIds.add(element.userId);
        });
      }
      const getUserInfosRequest = {
        userIds: Array.from(userIds.values()),
      };
      const getUserInfosResponse: IMessage = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'user',
        'internal:/api/v1/userInfos',
        getUserInfosRequest
      );
      const userInfos = Kafka.getResponse<any[]>(getUserInfosResponse);
      const mapUsers: Map<number, any> = new Map();
      userInfos.forEach((user) => {
        mapUsers.set(user.id, user);
      });
      const author = mapUsers.get(post.userId);
      if (author && author.status == 'ACTIVE') {
        const tags: any[] = [];
        if (post.tags) {
          post.tags.forEach((tag) => {
            const tagUserInfo = mapUsers.get(tag);
            if (tagUserInfo && tagUserInfo.status === 'ACTIVE') {
              tags.push({
                id: tag,
                name: tagUserInfo.name,
                avatar: tagUserInfo.avatar,
              });
            }
          });
        }
        const comments: any[] = [];
        if (post.comments != null) {
          post.comments.forEach((comment: Comment) => {
            const userInfo = mapUsers.get(comment.userId);
            if (userInfo && userInfo.status === 'ACTIVE') {
              comments.push({
                id: comment._id.toHexString(),
                postId: post.id.toHexString(),
                userId: comment.userId,
                avatar: userInfo.avatar,
                name: userInfo.name,
                comment: comment.comment,
                createdAt: comment.createdAt,
              });
            }
          });
        }
        return {
          id: post.id,
          source: post.source,
          author: author,
          tags: tags,
          caption: post.caption,
          createdAt: post.createdAt,
          disable: post.disable,
          reactions: post.reactions != null ? post.reactions.map((reaction) => reaction.userId) : [],
          comments: comments,
        };
      }
      return {};
    } catch (err) {
      console.log(err);
      return {};
    }
  }

  public async comment(request: ICommentRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    Utils.validate(request.comment, 'comment').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const name = request.headers.token.userData.name;
    const userId = request.headers.token.userData.id;
    while (await this.cacheService.findInprogessValidate(request.postId, 'DELETE_DISABLE_POST', transactionId)) {
      Logger.warn(`${transactionId} waiting do progess`);
    }
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.postId),
        disable: false,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    const sanitisedComment = this.sanitise(request.comment);
    const extractMentions = this.extractUserStrings(sanitisedComment).toLocaleString().toLowerCase();
    const mentions: Set<number> = new Set();
    if (extractMentions.length > 0) {
      extractMentions.split(',').forEach((element) => {
        const mentionUserId = this.extractMentionUserId(element);
        if (mentionUserId != null) {
          mentions.add(mentionUserId);
        }
      });
    }
    const comment: Comment = new Comment();
    comment._id = new ObjectID();
    comment.userId = request.headers.token.userData.id;
    comment.comment = sanitisedComment;
    comment.createdAt = new Date();
    comment.mentions = Array.from(mentions.values());
    this.postRepository.updateOne(
      {
        _id: new ObjectID(request.postId),
      },
      {
        $push: {
          comments: comment,
        },
      }
    );
    const userInfosResponse: IMessage = await getInstance().sendRequestAsync(
      `${transactionId}`,
      'user',
      'get:/api/v1/user/info',
      {
        headers: request.headers,
      }
    );
    const userInfosData = Kafka.getResponse<any>(userInfosResponse);
    this.publish(
      'comment',
      {
        to: post.id.toHexString(),
        data: {
          id: comment._id.toHexString(),
          postId: request.postId,
          userId: comment.userId,
          avatar: userInfosData.avatar,
          name: userInfosData.name,
          comment: comment.comment,
          createdAt: comment.createdAt,
        },
      },
      sourceId
    );
    this.publish(
      'post.comment',
      {
        to: post.id.toHexString(),
        data: {
          comments: [comment.userId],
        },
      },
      sourceId
    );
    const PromiseArray: Promise<any>[] = [
      new Promise((resolve) => {
        utils.sendMessagePushNotification(
          `${transactionId}`,
          post.userId,
          `${name} comment on your post: ${sanitisedComment}`,
          'push_up',
          FirebaseType.TOKEN,
          true,
          null,
          'COMMENT',
          post.id.toHexString(),
          userId
        );
        resolve(null);
      }),
    ];
    if (mentions.size > 0) {
      mentions.forEach((mention) => {
        PromiseArray.push(
          new Promise((resolve) => {
            utils.sendMessagePushNotification(
              `${transactionId}`,
              mention,
              `${name} mention you on comment: ${sanitisedComment}`,
              'push_up',
              FirebaseType.TOKEN,
              true,
              null,
              'MENTION_ON_COMMENT',
              post.id.toHexString(),
              userId
            );
            resolve(null);
          })
        );
      });
    }
    Promise.all(PromiseArray);
    return {};
  }

  public async reaction(request: IReactionRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    Utils.validate(request.reaction, 'reaction').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const name = request.headers.token.userData.name;
    const userId = request.headers.token.userData.id;
    while (await this.cacheService.findInprogessValidate(request.postId, 'DELETE_DISABLE_POST', transactionId)) {
      Logger.warn(`${transactionId} waiting do progess`);
    }
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.postId),
        disable: false,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    const reaction: Reaction = new Reaction();
    reaction._id = new ObjectID();
    reaction.userId = request.headers.token.userData.id;
    reaction.reaction = request.reaction;
    this.postRepository.updateOne(
      {
        _id: new ObjectID(request.postId),
      },
      {
        $push: {
          reactions: reaction,
        },
      }
    );
    utils.sendMessagePushNotification(
      `${transactionId}`,
      post.userId,
      `${name} like on your post`,
      'push_up',
      FirebaseType.TOKEN,
      true,
      null,
      'LIKE',
      post.id.toHexString(),
      userId
    );
    this.publish('post.reaction', { to: post.id.toHexString(), data: { reactions: [userId] } }, sourceId);
    return {};
  }

  public async getCommentsOfPost(request: IPostCommentReactionRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.postId),
        disable: false,
      },
    });
    if (post == null || post.comments == null) {
      return [];
    }
    const comments: Comment[] = post.comments;
    const users: Set<number> = new Set();
    comments.forEach((comment: Comment) => {
      users.add(comment.userId);
    });
    try {
      const userInfosRequest = {
        userIds: Array.from(users.values()),
        headers: request.headers,
      };
      const userInfosResponse: IMessage = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'user',
        'internal:/api/v1/userInfos',
        userInfosRequest
      );
      const userInfosData = Kafka.getResponse<any[]>(userInfosResponse);
      const mapUserInfos: Map<number, any> = new Map();
      userInfosData.forEach((info: any) => {
        mapUserInfos.set(info.id, info);
      });
      const responses: any[] = [];
      comments.forEach((comment: Comment) => {
        const userInfo = mapUserInfos.get(comment.userId);
        if (userInfo && userInfo.status === 'ACTIVE') {
          const response = {
            id: comment._id.toHexString(),
            postId: request.postId,
            userId: comment.userId,
            avatar: userInfo.avatar,
            name: userInfo.name,
            comment: comment.comment,
            createdAt: comment.createdAt,
          };
          responses.push(response);
        }
      });
      return responses;
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      return [];
    }
  }

  public async deleteComment(request: ICommentRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    Utils.validate(request.commentId, 'commentId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.postId),
        disable: false,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    const comment: Comment = post.comments.find((comment) => comment._id == request.commentId);
    if (comment == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    if (comment.userId != request.headers.token.userData.id) {
      throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
    }
    await this.postRepository.updateOne(
      {
        _id: new ObjectID(request.postId),
      },
      { $pull: { comments: { _id: new ObjectID(request.commentId) } } }
    );
    this.publish(
      'delete.comment',
      {
        to: post.id.toHexString(),
        id: request.commentId,
      },
      sourceId
    );
    return {};
  }

  public async getReactionsOfPost(request: IPostCommentReactionRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const post: Post = await this.postRepository.findOne({
      where: {
        _id: new ObjectID(request.postId),
        disable: false,
      },
    });
    if (post == null || post.reactions == null) {
      return [];
    }
    const reactions: Reaction[] = post.reactions;
    const users: Set<number> = new Set();
    reactions.forEach((reaction: Reaction) => {
      users.add(reaction.userId);
    });
    try {
      const userInfosRequest = {
        userIds: Array.from(users.values()),
        headers: request.headers,
      };
      const userInfosResponse: IMessage = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'user',
        'internal:/api/v1/userInfos',
        userInfosRequest
      );
      const userInfosData = Kafka.getResponse<any[]>(userInfosResponse);
      const mapUserInfos: Map<number, any> = new Map();
      userInfosData.forEach((info: any) => {
        mapUserInfos.set(info.id, info);
      });
      const responses: any[] = [];
      reactions.map((reaction: Reaction) => {
        const userInfo = mapUserInfos.get(reaction.userId);
        if (userInfo && userInfo.status === 'ACTIVE') {
          responses.push({
            id: reaction._id.toHexString(),
            userId: reaction.userId,
            avatar: userInfo.avatar,
            name: userInfo.name,
            reaction: reaction.reaction,
            createdAt: reaction.createdAt,
          });
        }
      });
      return responses;
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      return [];
    }
  }

  private sanitise(text: string) {
    let sanitisedText = text;

    if (text.indexOf('<') > -1 || text.indexOf('>') > -1) {
      sanitisedText = text.replace(/</g, '&lt').replace(/>/g, '&gt');
    }

    return sanitisedText;
  }

  private publish(type: string, data: any, clientId: string) {
    const outgoing = {
      clientId: clientId,
      type: type,
      data: data,
    };
    this.redisService.publish('gateway', outgoing);
  }

  private extractMentionUserId(username: string): number | null {
    const regex = /\[([^\]]+)\]\((\d+)\)/g;
    const matches = regex.exec(username);

    if (matches && matches.length === 3) {
      const userId = matches[2];
      return Number(userId);
    } else {
      return null;
    }
  }

  private extractUserStrings(input: string): string[] {
    const regex = /\@\[([^\]]+)\]\((\d+)\)/g;
    const matches: string[] = [];
    let match;

    while ((match = regex.exec(input)) !== null) {
      matches.push(match[0]);
    }

    return matches;
  }
}
