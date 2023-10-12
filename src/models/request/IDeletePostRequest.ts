import { IDataRequest } from 'common/build/src/modules/models';
import { ObjectId } from 'mongodb';

export default interface IDeletePostRequest extends IDataRequest {
  post?: ObjectId;
  disable?: boolean;
  hash?: string;
}
