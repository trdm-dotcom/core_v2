import { IDataRequest } from 'common/build/src/modules/models';

export default interface IRoomRequest extends IDataRequest {
  roomId?: string;
  userIds?: number[];
}
