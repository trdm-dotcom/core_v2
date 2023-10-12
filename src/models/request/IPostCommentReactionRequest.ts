import { IDataRequest } from 'common/build/src/modules/models';
import { ObjectId } from 'mongodb';

export interface IPostCommentReactionRequest extends IDataRequest {
  postId: ObjectId;
  pageSize?: number;
  pageNumber?: number;
}
