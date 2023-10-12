import { IDataRequest } from 'common/build/src/modules/models';
import { ObjectId } from 'mongodb';

export interface ICommentRequest extends IDataRequest {
  comment?: string;
  postId?: ObjectId;
  replyId?: ObjectId;
}
