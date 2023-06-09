import { IDataRequest } from "common/build/src/modules/models";
import { ReactionType } from "../enum/ReactionType";

export interface IReactionRequest extends IDataRequest {
  reaction?: ReactionType;
  postId?: number;
}
