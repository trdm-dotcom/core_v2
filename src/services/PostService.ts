import { Inject, Service } from 'typedi';
import IPostRequest from '../models/request/IPostRequest';
import Post from '../models/entities/Post';
import { AppDataSource } from '../Connection';
import { Errors, Logger, Utils } from 'common';
import * as utils from '../utils/Utils';
import IDeletePostRequest from '../models/request/IDeletePostRequest';
import { Repository } from 'typeorm';
import CacheService from './CacheService';
import Constants from '../Constants';

@Service()
export default class PostService {
  @Inject()
  private cacheService: CacheService;

  private postRepository: Repository<Post> = AppDataSource.getRepository(Post);

  public async store(request: IPostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.path, 'path').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'UP_POST');
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      let post: Post = new Post();
      post.userId = request.headers.token.userData.id;
      post.disable = false;
      post.path = request.path;
      await transactionalEntityManager.save(post);
    });
    return {};
  }
  public async delete(request: IDeletePostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.post, 'post').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'DELETE_POST');
    const post: Post = await this.postRepository.findOneBy({ id: request.post });
    try {
      while (await this.cacheService.findInprogessValidate(request.post, 'MODIFY_POST', transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(request.post, 'MODIFY_POST', transactionId);
      if (post == null) {
        throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
      }
      if (post.userId != request.headers.token.userData.id) {
        throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
      }
      await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.delete(Post, post.id);
      });
    } finally {
      this.cacheService.removeInprogessValidate(request.post, 'MODIFY_POST', transactionId);
    }
    return {};
  }

  public async update(request: IDeletePostRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.post, 'post').setRequire().throwValid(invalidParams);
    Utils.validate(request.hash, 'hash').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    utils.validHash(request.hash, 'UPDATE_POST');
    const post: Post = await this.postRepository.findOneBy({ id: request.post });
    try {
      while (await this.cacheService.findInprogessValidate(request.post, 'MODIFY_POST', transactionId)) {
        Logger.warn(`${transactionId} waiting do progess`);
      }
      this.cacheService.addInprogessValidate(request.post, 'MODIFY_POST', transactionId);
      if (post == null) {
        throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
      }
      if (post.userId != request.headers.token.userData.id) {
        throw new Errors.GeneralError(Constants.USER_DONT_HAVE_PERMISSION);
      }
      await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
        transactionalEntityManager.update(Post, post.id, { disable: request.disable });
      });
    } finally {
      this.cacheService.removeInprogessValidate(request.post, 'MODIFY_POST', transactionId);
    }
    return {};
  }
}
