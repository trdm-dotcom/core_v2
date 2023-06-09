import { Service } from 'typedi';
import { AppDataSource } from '../Connection';
import { ICommentRequest } from '../models/request/ICommentRequest';
import { Errors, Utils } from 'common';
import Comment from '../models/entities/Comment';
import Reaction from '../models/entities/Reaction';
import { IReactionRequest } from '../models/request/IReactionRequest';

@Service()
export default class ReactionService {

  public async comment(request: ICommentRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    Utils.validate(request.comment, 'comment').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      let comment: Comment = new Comment();
      comment.userId = request.headers.token.userData.id;
      comment.comment = request.comment;
      comment.postId = request.postId;
      await transactionalEntityManager.save(comment);
    });
    return {};
  }

  public async reaction(request: IReactionRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.postId, 'postId').setRequire().throwValid(invalidParams);
    Utils.validate(request.reaction, 'reaction').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    await AppDataSource.manager.transaction(async (transactionalEntityManager) => {
      let reaction: Reaction = new Reaction();
      reaction.userId = request.headers.token.userData.id;
      reaction.reaction = request.reaction;
      reaction.postId = request.postId;
      await transactionalEntityManager.save(reaction);
    });
    return {};
  }
}
