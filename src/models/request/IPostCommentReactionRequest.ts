import { IDataRequest } from 'common/build/src/modules/models';

export interface IPostCommentReactionRequest extends IDataRequest {
  postId: string;
  pageSize: number;
  pageNumber: number;
}
