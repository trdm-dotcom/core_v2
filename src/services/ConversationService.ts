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
import { ObjectId } from 'mongodb';
import * as utils from '../utils/Utils';

@Service()
export default class ConversationService {
  @Inject()
  private redisService: RedisService;

  @InjectRepository(Conversation)
  private repository: MongoRepository<Conversation>;

  public async sendMessage(request: IChatRequest, sourceId: string, msgId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.message, 'message').setRequire().throwValid(invalidParams);
    Utils.validate(request.recipientId, 'recipientId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const checkFriendRequest = {
      friendId: request.recipientId,
      headers: request.headers,
    };
    let data: any = {};
    try {
      const checkFriendResponse: IMessage = await getInstance().sendRequestAsync(
        `${msgId}`,
        'user',
        'internal:/api/v1/user/checkFriend',
        checkFriendRequest
      );
      data = Kafka.getResponse(checkFriendResponse);
    } catch (err) {
      Logger.error(`${msgId} fail to send message`, err);
      throw new Errors.GeneralError();
    }
    if (!data.isFriend) {
      throw new Errors.GeneralError(Constants.WAS_BLOCKED);
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
      `${msgId}`,
      request.recipientId,
      `${request.headers.token.userData.id}`,
      request.message,
      'push_up',
      false,
      FirebaseType.TOKEN
    );
    this.publish(
      'message',
      {
        from: userId,
        date: now.getTime(),
        roomId: conversation.id,
        message: this.sanitise(request.message),
      },
      sourceId
    );
    this.publish(
      'show.room',
      {
        id: conversation.id,
        to: request.recipientId,
      },
      sourceId
    );
    return {};
  }

  public async getConversations(request: IChatRequest, msgId: string | number) {
    const userId: number = request.headers.token.userData.id;
    const limit = request.pageSize == null ? 20 : Math.min(request.pageSize, 100);
    const offset = request.pageNumber == null ? 0 : Math.max(request.pageNumber - 1, 0) * limit;
    const userIds: number[] = [userId];
    if (request.search != null) {
      const requestSearchUser = {
        search: request.search,
        headers: request.headers,
      };
      try {
        const searchUserResponse: IMessage = await getInstance().sendRequestAsync(
          `${msgId}`,
          'user',
          'internal:/api/v1/user/search',
          requestSearchUser
        );
        const data = Kafka.getResponse<any[]>(searchUserResponse);
        data.forEach((user: any) => {
          userIds.push(user.id);
        });
      } catch (err) {
        Logger.error(`${msgId} fail to send message`, err);
        throw new Errors.GeneralError();
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
    const mapConversations: Map<number, Conversation> = new Map();
    const users: number[] = [];
    conversations.forEach((conversation: Conversation) => {
      const user: number = conversation.users.find((user: number) => user !== userId);
      users.push(user);
      mapConversations.set(user, conversation);
    });
    const userInfosRequest = {
      userIds: users,
      headers: request.headers,
    };
    try {
      const userInfosResponse: IMessage = await getInstance().sendRequestAsync(
        `${msgId}`,
        'user',
        'internal:/api/v1/userInfos',
        userInfosRequest
      );
      const userInfosData = Kafka.getResponse<any[]>(userInfosResponse);
      return userInfosData.map((info: any) => {
        const conversation: Conversation = mapConversations.get(info.id);
        return {
          id: conversation.id,
          name: info.name,
          avatar: info.avatar,
          lastMessage: conversation.messages[conversation.messages.length - 1],
        };
      });
    } catch (err) {
      Logger.error(`${msgId} fail to send message`, err);
      throw new Errors.GeneralError();
    }
  }

  public async deleteRoom(request: IChatRequest, msgId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.recipientId, 'recipientId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const conversation: Conversation = await this.repository.findOne({
      where: {
        users: {
          $all: [userId, request.recipientId],
        },
      },
    });
    if (conversation == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    await this.repository.deleteOne({ _id: new ObjectId(conversation.id) });
    this.publish('delete.room', { id: conversation.id }, sourceId);
    return {};
  }

  public async getMessagesByRoomId(request: IChatRequest, msgId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.recipientId, 'recipientId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const conversation: Conversation = await this.repository.findOne({
      where: {
        users: {
          $all: [userId, request.recipientId],
        },
      },
    });
    if (conversation == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    return conversation.messages.map((message: Message) => ({
      message: message.message,
      createdAt: message.createdAt,
      userId: message.userId,
    }));
  }

  public async deleteAll(request: IDataRequest, msgId: string | number) {
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
    this.redisService.publish('core', outgoing);
  }
}
