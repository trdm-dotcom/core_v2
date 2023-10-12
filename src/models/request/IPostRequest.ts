import { IDataRequest } from 'common/build/src/modules/models';
import { ObjectId } from 'mongodb';

export default interface IPostRequest extends IDataRequest {
  post?: ObjectId;
  source?: string;
  hash?: string;
  tags?: number[];
  caption?: string;
  pageSize?: number;
  pageNumber?: number;
}
