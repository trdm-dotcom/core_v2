import { IDataRequest } from 'common/build/src/modules/models';

export default interface IDeletePostRequest extends IDataRequest {
  post?: string;
  disable?: boolean;
  hash?: string;
}
