import { Inject, Service } from 'typedi';
import IPostRequest from '../models/request/IPostRequest';
import Post from '../models/entities/Post';
import { Errors, Logger, Utils } from 'common';
import * as utils from '../utils/Utils';
import IDeletePostRequest from '../models/request/IDeletePostRequest';
import { MongoRepository, ObjectID } from 'typeorm';
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
    const post: Post = new Post();
    post.userId = request.headers.token.userData.id;
    post.disable = false;
    post.source = request.source;
    post.tags = request.tags;
    await this.postRepository.save(post);
    return {};
  }

  public async delete(request: IDeletePostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.post, 'post').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'DELETE_POST');
    const userId = request.headers.token.userData.id;
    const post: Post = await this.postRepository.findOne({
      where: {
        id: ObjectID.createFromHexString(request.post),
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
      await this.postRepository.delete({ id: post.id });
    } finally {
      this.cacheService.removeInprogessValidate(request.post, 'DELETE_DISABLE_POST', transactionId);
    }
    return {};
  }

  public async disable(request: IDeletePostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.post, 'post').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'DISABLE_POST');
    const userId = request.headers.token.userData.id;
    const post: Post = await this.postRepository.findOne({
      where: {
        id: ObjectID.createFromHexString(request.post),
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
      await this.postRepository.update({ id: post.id }, { disable: true });
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
        id: ObjectID.createFromHexString(request.post),
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
      await this.postRepository.update({ id: post.id }, { caption: request.caption, tags: request.tags });
    } finally {
      this.cacheService.removeInprogessValidate(request.post, 'MODIFY_POST', transactionId);
    }
    return {};
  }

  public async get(request: IPostRequest, transactionId: string | number) {
    const limit = request.pageSize == null ? 20 : Math.min(request.pageSize, 100);
    const offset = request.pageNumber == null ? 0 : Math.max(request.pageNumber - 1, 0) * limit;
    try {
      const getFriendRequest = {
        headers: request.headers,
      };
      const getFriendResponse: IMessage = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'user',
        'internal:/api/v1/user/friends',
        getFriendRequest
      );
      const friendsData = Kafka.getResponse<any[]>(getFriendResponse);
      const mapUsers: Map<number, any> = new Map();
      for (const friend of friendsData) {
        mapUsers.set(friend.id, friend);
      }
      const posts: Post[] = await this.postRepository.find({
        where: {
          userId: { $in: Array.from(mapUsers.keys()) },
          disable: false,
        },
        order: {
          createdAt: 'DESC',
        },
        skip: offset,
        take: limit,
      });
      return posts.map((post: Post) => ({
        id: post.id,
        userId: post.userId,
        source: post.source,
        name: mapUsers.get(post.userId).name,
        avatar: mapUsers.get(post.userId).avatar,
        tags: post.tags.map((tag) => ({
          id: tag,
          name: mapUsers.get(tag).name,
          avatar: mapUsers.get(tag).avatar,
        })),
        caption: post.caption,
        createdAt: post.createdAt,
      }));
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      throw new Errors.GeneralError();
    }
  }

  public async comment(request: ICommentRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    Utils.validate(request.comment, 'comment').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    while (await this.cacheService.findInprogessValidate(request.postId, 'DELETE_DISABLE_POST', transactionId)) {
      Logger.warn(`${transactionId} waiting do progess`);
    }
    const post: Post = await this.postRepository.findOne({
      where: {
        id: ObjectID.createFromHexString(request.postId),
        disable: true,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    let comment: Comment;
    if (request.commentId != null) {
      comment = post.comments.find((comment) => comment.id === ObjectID.createFromHexString(request.commentId));
      const replyComment: Comment = new Comment();
      replyComment.id = new ObjectID();
      replyComment.userId = request.headers.token.userData.id;
      replyComment.comment = this.sanitise(request.comment);
      replyComment.parent = comment;
      replyComment.post = post;
      comment.children.push(replyComment);
    } else {
      comment = new Comment();
      comment.id = new ObjectID();
      comment.userId = request.headers.token.userData.id;
      comment.post = post;
      comment.comment = this.sanitise(request.comment);
    }
    this.postRepository.updateOne(
      {
        id: post.id,
      },
      {
        $push: {
          comments: comment,
        },
      }
    );
    utils.sendMessagePushNotification(
      `${transactionId}`,
      post.userId,
      `${request.headers.token.userData.id} comment on your post`,
      this.sanitise(request.comment),
      'push_up',
      true,
      FirebaseType.TOKEN
    );
    this.publish('comment', { postId: request.postId, comment: request.comment }, sourceId);
    return {};
  }

  public async reaction(request: IReactionRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    Utils.validate(request.reaction, 'reaction').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    while (await this.cacheService.findInprogessValidate(request.postId, 'DELETE_DISABLE_POST', transactionId)) {
      Logger.warn(`${transactionId} waiting do progess`);
    }
    const post: Post = await this.postRepository.findOne({
      where: {
        id: ObjectID.createFromHexString(request.postId),
        disable: true,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    const reaction: Reaction = new Reaction();
    reaction.userId = request.headers.token.userData.id;
    reaction.reaction = request.reaction;
    reaction.post = post;
    this.postRepository.updateOne(
      {
        id: post.id,
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
      `${request.headers.token.userData.id} reaction on your post`,
      '',
      'push_up',
      true,
      FirebaseType.TOKEN
    );
    this.publish('reaction', { postId: request.postId, reaction: request.reaction }, sourceId);
    return {};
  }

  public async getCommentsOfPost(request: IPostCommentReactionRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const limit = request.pageSize == null ? 20 : Math.min(request.pageSize, 100);
    const offset = request.pageNumber == null ? 0 : Math.max(request.pageNumber - 1, 0) * limit;
    const post: Post = await this.postRepository.findOne({
      where: {
        id: ObjectID.createFromHexString(request.postId),
        disable: false,
      },
      select: ['comments'],
    });
    if (post == null) {
      return [];
    }
    if (post.comments.length <= offset) {
      return [];
    }
    const comments: Comment[] = post.comments.slice(offset, offset + limit);
    const users: Set<number> = new Set();
    comments.forEach((comment: Comment) => {
      users.add(comment.userId);
      comment.children.forEach((reply) => users.add(reply.userId));
    });
    try {
      const userInfosRequest = {
        userIds: users,
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
      return comments.map((comment: Comment) => ({
        postId: request.postId,
        userId: comment.userId,
        avatar: mapUserInfos.get(comment.userId).avatar,
        name: mapUserInfos.get(comment.userId).name,
        comment: comment.comment,
        commentReplies: comment.children.map((reply) => ({
          userId: reply.userId,
          avatar: mapUserInfos.get(reply.userId).avatar,
          name: mapUserInfos.get(reply.userId).name,
          comment: reply.comment,
        })),
        createdAt: comment.createdAt,
      }));
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      throw new Errors.GeneralError();
    }
  }

  public async deleteComment(request: ICommentRequest, transactionId: string | number) {
    const post: Post = await this.postRepository.findOne({
      where: {
        id: ObjectID.createFromHexString(request.postId),
        disable: true,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    const comment: Comment = post.comments.find(
      (comment) => comment.id === ObjectID.createFromHexString(request.commentId)
    );
    if (comment == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    if (comment.userId != request.headers.token.userData.id) {
      throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
    }
    await this.postRepository.updateOne(
      { id: post.id },
      { $pull: { comments: { id: ObjectID.createFromHexString(request.commentId) } } }
    );
    return {};
  }

  public async getReactionsOfPost(request: IPostCommentReactionRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const limit = request.pageSize == null ? 20 : Math.min(request.pageSize, 100);
    const offset = request.pageNumber == null ? 0 : Math.max(request.pageNumber - 1, 0) * limit;
    const post: Post = await this.postRepository.findOne({
      where: {
        id: ObjectID.createFromHexString(request.postId),
        disable: false,
      },
      select: ['comments'],
    });
    if (post == null) {
      return [];
    }
    if (post.reactions.length <= offset) {
      return [];
    }
    const reactions: Reaction[] = post.reactions.slice(offset, offset + limit);
    const users: Set<number> = new Set();
    reactions.forEach((reaction: Reaction) => {
      users.add(reaction.userId);
    });
    try {
      const userInfosRequest = {
        userIds: users,
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
      return reactions.map((reaction: Reaction) => ({
        postId: request.postId,
        userId: reaction.userId,
        avatar: mapUserInfos.get(reaction.userId).avatar,
        name: mapUserInfos.get(reaction.userId).name,
        reaction: reaction.reaction,
        createdAt: reaction.createdAt,
      }));
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      throw new Errors.GeneralError();
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
    this.redisService.publish('core', outgoing);
  }
}
