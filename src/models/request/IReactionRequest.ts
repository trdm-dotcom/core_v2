import { IDataRequest } from 'common/build/src/modules/models';

export interface IReactionRequest extends IDataRequest {
  reaction?: string;
  postId?: string;
}
