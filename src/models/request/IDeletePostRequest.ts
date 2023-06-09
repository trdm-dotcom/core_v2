import { IDataRequest } from 'common/build/src/modules/models';

export default interface IDeletePostRequest extends IDataRequest {
  post?: number;
  disable?: boolean;
  hash?: string;
}
