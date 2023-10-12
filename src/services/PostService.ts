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
import { ObjectId } from 'mongodb';
import { FirebaseType } from 'common/build/src/modules/models';
import { IReactionRequest } from '../models/request/IReactionRequest';
import RedisService from './RedisService';
import { ICommentRequest } from '../models/request/ICommentRequest';
import Reaction from '../models/entities/Reaction';
import Comment from '../models/entities/Comment';

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
        _id: new ObjectId(request.post),
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
      await this.postRepository.delete({ id: new ObjectId(post.id) });
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
        _id: new ObjectId(request.post),
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
      await this.postRepository.update({ id: new ObjectId(post.id) }, { disable: true });
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
        _id: new ObjectId(request.post),
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
      await this.postRepository.update(new ObjectId(post.id), { caption: request.caption, tags: request.tags });
    } finally {
      this.cacheService.removeInprogessValidate(request.post, 'MODIFY_POST', transactionId);
    }
    return {};
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
        _id: new ObjectId(request.postId),
        disable: true,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    let comment: Comment;
    if (request.replyId != null) {
      comment = post.comments.find((comment) => comment.id.equals(request.replyId));
      const replyComment: Comment = new Comment();
      replyComment.id = new ObjectId();
      replyComment.userId = request.headers.token.userData.id;
      replyComment.comment = this.sanitise(request.comment);
      comment.commentReplies.push(replyComment);
    } else {
      comment = new Comment();
      comment.id = new ObjectId();
      comment.userId = request.headers.token.userData.id;
      comment.comment = this.sanitise(request.comment);
    }
    this.postRepository.updateOne(
      {
        _id: new ObjectId(post.id),
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
        _id: new ObjectId(request.postId),
        disable: true,
      },
    });
    if (post == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    const reaction: Reaction = new Reaction();
    reaction.userId = request.headers.token.userData.id;
    reaction.reaction = request.reaction;
    this.postRepository.updateOne(
      {
        _id: new ObjectId(post.id),
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
