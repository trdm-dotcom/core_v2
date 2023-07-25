import { IDataRequest } from 'common/build/src/modules/models';

export default interface IChatRequest extends IDataRequest {
  message?: string;
  roomId?: string;
  offset?: number;
  size?: number;
}
