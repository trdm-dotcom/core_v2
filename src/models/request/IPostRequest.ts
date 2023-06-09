import { IDataRequest } from 'common/build/src/modules/models';

export default interface IPostRequest extends IDataRequest {
  path?: string;
  hash?: string;
}
