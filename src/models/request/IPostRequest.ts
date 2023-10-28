import { IDataRequest } from 'common/build/src/modules/models';

export default interface IPostRequest extends IDataRequest {
  post: string;
  source: string;
  hash: string;
  tags: number[];
  caption: string;
  pageSize: number;
  pageNumber: number;
  targetId: number;
}
