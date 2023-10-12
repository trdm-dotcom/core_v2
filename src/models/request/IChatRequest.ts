import { IDataRequest } from 'common/build/src/modules/models';

export default interface IChatRequest extends IDataRequest {
  message?: string;
  recipientId?: number;
  search?: number;
  pageSize?: number;
  pageNumber?: number;
}
