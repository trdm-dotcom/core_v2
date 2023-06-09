import { IDataRequest } from 'common/build/src/modules/models';

export interface ICommentRequest extends IDataRequest {
  comment?: string;
  postId?: number;
}
