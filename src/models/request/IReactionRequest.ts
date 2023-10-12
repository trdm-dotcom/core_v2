import { IDataRequest } from 'common/build/src/modules/models';
import { ObjectId } from 'mongodb';
export interface IReactionRequest extends IDataRequest {
  reaction?: string;
  postId?: ObjectId;
}
