import { IDataRequest } from 'common/build/src/modules/models';

export interface IReportRequest extends IDataRequest {
  sourceId: string;
  reason: string;
}
