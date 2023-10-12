import { IDataRequest } from 'common/build/src/modules/models';
import { ObjectId } from 'mongodb';

export default interface IRoomRequest extends IDataRequest {
  roomId?: ObjectId;
  userIds?: number[];
}
