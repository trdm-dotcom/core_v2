import { Inject, Service } from 'typedi';
import RedisService from './RedisService';
import IChatRequest from '../models/request/IChatRequest';
import { Errors, Logger, Utils } from 'common';
import config from '../Config';
import { IDataRequest } from 'common/build/src/modules/models';
import IRoomRequest from '../models/request/IRoomRequest';
import Constants from '../Constants';

@Service()
export default class ChatService {
  @Inject()
  private redisService: RedisService;

  public async sendMessage(request: IChatRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.message, 'message').setRequire().throwValid(invalidParams);
    Utils.validate(request.roomId, 'roomId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const roomKey = `room:${request.roomId}`;
    const message = {
      from: request.headers.token.userData.id,
      date: new Date().getTime(),
      roomId: request.roomId,
      message: this.sanitise(request.message),
    };
    const userId = request.headers.token.userData.id;
    const isPrivate = !(await this.redisService.exists(`${roomKey}:name`));
    const roomExists = await this.redisService.sismember(`user:${userId}:rooms`, request.roomId);
    if (roomExists && isPrivate) {
      const partnerId = request.roomId.split(':').find((id) => Number(id) !== userId);
      await this.redisService.sadd(`user:${userId}:rooms`, request.roomId);
      await this.redisService.sadd(`user:${partnerId}:rooms`, request.roomId);
    }
    const roomHasMessages = await this.redisService.exists(roomKey);
    if (isPrivate && !roomHasMessages) {
      const ids = request.roomId.split(':');
      const msg = {
        id: message.roomId,
        names: await Promise.all(ids.map((id) => this.redisService.hmget(`user:${id}`, 'username'))),
      };
      this.publish('show.room', msg);
    }
    this.redisService.zadd(roomKey, message.date, message);
    this.publish('message', message);
    return message;
  }

  public async getMessagesByRoomId(request: IChatRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.roomId, 'roomId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    try {
      const offset = request.offset ? +Math.max(request.offset, 0) : +config.app.defaultPageOffset;
      const size = request.size ? +Math.max(request.size, 0) : +config.app.defaultPageSize;
      return await this.getMessages(request.roomId, offset, size);
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    }
  }

  public async getRooms(request: IDataRequest, transaction: string | number) {
    const userId = request.headers.token.userData.id;
    const roomIds = await this.redisService.smembers(`user:${userId}:rooms`);
    const rooms = [];
    for (let roomId of roomIds) {
      let name = await this.redisService.get(`room:${roomId}:name`);
      if (!name) {
        const roomExists = await this.redisService.exists(`room:${roomId}`);
        if (!roomExists) {
          continue;
        }
        const userIds = roomId.split(':');
        rooms.push({
          id: roomId,
          names: await Promise.all(userIds.map((userId) => this.redisService.hmget(`user:${userId}`, 'username'))),
        });
      } else {
        rooms.push({
          id: roomId,
          names: [name],
        });
      }
    }
    return rooms;
  }

  public async deleteRoom(request: IRoomRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.roomId, 'roomId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId = request.headers.token.userData.id;
    const roomExists = await this.redisService.exists(`room:${request.roomId}`);
    if (!roomExists) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    try {
      await Promise.all([
        this.redisService.srem(`user:${userId}:rooms`, request.roomId),
        this.redisService.del(`room:${request.roomId}`),
      ]);
    } catch (error) {
      Logger.error(`${transactionId} Error:`, error);
      if (error instanceof Errors.GeneralError) {
        throw error;
      } else {
        throw new Errors.GeneralError();
      }
    }
    return {};
  }

  private async getMessages(roomId: string, offset: number, size: number) {
    const roomKey = `room:${roomId}`;
    const roomExists = await this.redisService.exists(roomKey);
    if (!roomExists) {
      return [];
    } else {
      return this.redisService.zrange(roomKey, offset, offset + size - 1);
    }
  }

  private sanitise(text: string) {
    let sanitisedText = text;

    if (text.indexOf('<') > -1 || text.indexOf('>') > -1) {
      sanitisedText = text.replace(/</g, '&lt').replace(/>/g, '&gt');
    }

    return sanitisedText;
  }

  private publish(type, data) {
    const outgoing = {
      clientId: config.clientId,
      type: type,
      data: data,
    };
    this.redisService.publish('MESSAGES', outgoing);
  }
}
