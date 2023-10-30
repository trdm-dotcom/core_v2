import { Inject, Service } from 'typedi';
import IChatRequest from '../models/request/IChatRequest';
import { Errors, Logger, Utils } from 'common';
import { getInstance } from './KafkaProducerService';
import { IMessage } from 'kafka-common/build/src/modules/kafka';
import { Kafka } from 'kafka-common';
import Constants from '../Constants';
import { MongoRepository } from 'typeorm';
import Conversation from '../models/entities/Conversation';
import { Message } from '../models/entities/Message';
import RedisService from './RedisService';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { FirebaseType, IDataRequest } from 'common/build/src/modules/models';
import * as utils from '../utils/Utils';
import { ObjectID } from 'mongodb';

@Service()
export default class ConversationService {
  @Inject()
  private redisService: RedisService;

  @InjectRepository(Conversation)
  private repository: MongoRepository<Conversation>;

  public async sendMessage(request: IChatRequest, sourceId: string, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.message, 'message').setRequire().throwValid(invalidParams);
    Utils.validate(request.recipientId, 'recipientId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const name: string = request.headers.token.userData.name;
    const checkFriendRequest = {
      friend: request.recipientId,
      headers: request.headers,
    };
    let data: any = {};
    try {
      const checkFriendResponse: IMessage = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'user',
        'post:/api/v1/user/checkFriend',
        checkFriendRequest
      );
      data = Kafka.getResponse(checkFriendResponse);
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      throw new Errors.GeneralError();
    }
    if (!data.isFriend) {
      throw new Errors.GeneralError(Constants.CANT_SEND_MESSAGE);
    }
    let conversation: Conversation = await this.repository.findOne({
      where: {
        users: {
          $all: [userId, request.recipientId],
        },
      },
    });
    if (conversation == null) {
      conversation = new Conversation();
      conversation.users = [userId, request.recipientId];
      conversation = await this.repository.save(conversation);
    }
    const now: Date = new Date();
    const message: Message = new Message();
    message._id = new ObjectID(request.messagesId);
    message.userId = userId;
    message.message = this.sanitise(request.message);
    message.createdAt = now;
    await this.repository.updateOne(
      {
        _id: conversation.id,
      },
      {
        $push: {
          messages: message,
        },
      }
    );
    utils.sendMessagePushNotification(
      `${transactionId}`,
      request.recipientId,
      `${this.sanitise(request.message)} `,
      'push_up',
      FirebaseType.TOKEN,
      false,
      `${name} was sent you a message`
    );
    const userInfosResponse: IMessage = await getInstance().sendRequestAsync(
      `${transactionId}`,
      'user',
      'internal:/api/v1/userInfos',
      {
        userIds: [request.headers.token.userData.id],
        headers: request.headers,
      }
    );
    const userInfosData = Kafka.getResponse<any[]>(userInfosResponse);
    const mapUserInfos: Map<number, any> = new Map();
    userInfosData.forEach((info: any) => {
      mapUserInfos.set(info.id, info);
    });
    this.publish(
      'message',
      {
        to: request.recipientId,
        data: {
          _id: message._id.toHexString(),
          user: {
            _id: userId,
            name: name,
          },
          text: message.message,
          createdAt: message.createdAt,
        },
      },
      sourceId
    );
    this.publish(
      'show.room',
      {
        to: request.recipientId,
        data: {
          id: conversation.id,
          users: {
            _id: userId,
            name: name,
          },
          lastMessage: message,
        },
      },
      sourceId
    );
    return {};
  }

  public async getConversations(request: IChatRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(request.pageSize, 100);
    const offset = request.pageNumber == null ? 0 : Math.max(request.pageNumber, 0) * limit;
    const userIds: number[] = [userId];
    if (request.search != null) {
      const requestSearchUser = {
        search: request.search,
        headers: request.headers,
      };
      try {
        const searchUserResponse: IMessage = await getInstance().sendRequestAsync(
          `${transactionId}`,
          'user',
          'internal:/api/v1/user/search',
          requestSearchUser
        );
        const data = Kafka.getResponse<any[]>(searchUserResponse);
        data.forEach((user: any) => {
          userIds.push(user.id);
        });
      } catch (err) {
        Logger.error(`${transactionId} fail to send message`, err);
        return [];
      }
    }
    const conversations: Conversation[] = await this.repository.find({
      where: {
        users: {
          $in: userIds,
        },
      },
      order: { ['updatedAt']: 'DESC' },
      skip: offset,
      take: limit,
    });
    if (conversations.length <= 0) {
      return [];
    }
    const users: Set<number> = new Set<number>();
    conversations.forEach((conversation: Conversation) => {
      conversation.users.forEach((user) => users.add(user));
    });
    const userInfosRequest = {
      userIds: Array.from(users),
      headers: request.headers,
    };
    try {
      const userInfosResponse: IMessage = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'user',
        'internal:/api/v1/userInfos',
        userInfosRequest
      );
      const userInfosData = Kafka.getResponse<any[]>(userInfosResponse);
      const mapUserInfos: Map<number, any> = new Map();
      userInfosData.forEach((info: any) => {
        mapUserInfos.set(info.id, info);
      });
      return conversations.map((conversation: Conversation) => {
        const userInfos: any[] = [];
        conversation.users.forEach((userId) => {
          const info: any = mapUserInfos.get(userId);
          if (info != null) {
            userInfos.push(info);
          }
        });
        return {
          id: conversation.id,
          users: userInfos,
          lastMessage: conversation.messages[conversation.messages.length - 1],
        };
      });
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      return [];
    }
  }

  public async deleteRoom(request: IChatRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.chatId, 'chatId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const conversation: Conversation = await this.repository.findOne({
      where: {
        _id: new ObjectID(request.chatId),
        users: {
          $all: [userId],
        },
      },
    });
    if (conversation == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    await this.repository.delete(conversation.id);
    this.publish(
      'delete.room',
      { to: conversation.users.find((user) => user != userId), data: { id: conversation.id } },
      sourceId
    );
    return {};
  }

  public async getMessagesByRoomId(request: IChatRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.chatId, 'chatId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const conversation: Conversation = await this.repository.findOne({
      where: {
        _id: new ObjectID(request.chatId),
        users: {
          $all: [userId],
        },
      },
    });
    if (conversation == null) {
      return [];
    }
    const users: Set<number> = new Set<number>();
    conversation.users.forEach((user) => users.add(user));
    try {
      const userInfosRequest = {
        userIds: Array.from(users),
        headers: request.headers,
      };
      const userInfosResponse: IMessage = await getInstance().sendRequestAsync(
        `${transactionId}`,
        'user',
        'internal:/api/v1/userInfos',
        userInfosRequest
      );
      const userInfosData = Kafka.getResponse<any[]>(userInfosResponse);
      const mapUserInfos: Map<number, any> = new Map();
      userInfosData.forEach((info: any) => {
        mapUserInfos.set(info.id, info);
      });
      return conversation.messages.map((message: Message, index: number) => ({
        _id: message._id.toHexString(),
        user: {
          _id: message.userId,
          name: mapUserInfos.get(message.userId).name,
          avatar: mapUserInfos.get(message.userId).avatar,
        },
        text: message.message,
        createdAt: message.createdAt,
      }));
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      return [];
    }
  }

  public async deleteAll(request: IDataRequest, transactionId: string | number) {
    const userId: number = request.headers.token.userData.id;
    await this.repository.deleteMany({ users: { $ind: [userId] } });
    return {};
  }

  private sanitise(text: string) {
    let sanitisedText = text;

    if (text.indexOf('<') > -1 || text.indexOf('>') > -1) {
      sanitisedText = text.replace(/</g, '&lt').replace(/>/g, '&gt');
    }

    return sanitisedText;
  }

  private publish(type: string, data: any, clientId: string) {
    const outgoing = {
      clientId: clientId,
      type: type,
      data: data,
    };
    this.redisService.publish('gateway', outgoing);
  }

  public async getConversationBetween(request: IChatRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.recipientId, 'recipientId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const userIds: number[] = [userId, request.recipientId];
    const conversations: Conversation = await this.repository.findOne({
      where: {
        users: {
          $in: userIds,
        },
      },
    });
    return { chatId: conversations != null ? conversations.id : null };
  }
}
