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
import { FirebaseType } from 'common/build/src/modules/models';
import * as utils from '../utils/Utils';
import { ObjectID } from 'mongodb';
import Post from '../models/entities/Post';

@Service()
export default class ConversationService {
  @Inject()
  private redisService: RedisService;

  @InjectRepository(Conversation)
  private repository: MongoRepository<Conversation>;

  @InjectRepository(Post)
  private postRepository: MongoRepository<Post>;

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
        'get:/api/v1/user/checkFriend',
        checkFriendRequest
      );
      data = Kafka.getResponse(checkFriendResponse);
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      throw new Errors.GeneralError(Constants.CANT_SEND_MESSAGE);
    }
    if (!data.isFriend) {
      throw new Errors.GeneralError(Constants.CANT_SEND_MESSAGE);
    }
    let conversations: Conversation[] = await this.repository.find({
      where: {
        users: {
          $all: [userId, request.recipientId],
        },
      },
    });
    Logger.info(`${transactionId} conversations`, conversations);
    if (conversations.length <= 0) {
      const source: Conversation = new Conversation();
      source.users = [userId, request.recipientId];
      source.sourceUser = userId;
      source.targetUser = request.recipientId;
      const target: Conversation = new Conversation();
      target.users = [userId, request.recipientId];
      target.sourceUser = request.recipientId;
      target.targetUser = userId;
      await this.repository.save([source, target]);
    }
    const now: Date = new Date();
    const message: Message = new Message();
    message._id = new ObjectID();
    message.userId = userId;
    message.message = this.sanitise(request.message);
    message.createdAt = now;
    await this.repository.updateMany(
      {
        users: {
          $all: [userId, request.recipientId],
        },
      },
      {
        $set: {
          deletedAt: null,
        },
        $push: {
          messages: message,
        },
      }
    );
    this.publish(
      'receive-message',
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
          id: userId,
          users: {
            _id: userId,
            name: name,
          },
          lastMessage: message,
        },
      },
      sourceId
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
    return {};
  }

  public async getConversations(request: IChatRequest, transactionId: string | number) {
    const limit = request.pageSize == null ? 20 : Math.min(Number(request.pageSize), 100);
    const offset = request.pageNumber == null ? 0 : Math.max(Number(request.pageNumber), 0) * limit;
    const userId = request.headers.token.userData.id;
    let filter: any = {
      $all: [userId],
    };
    if (request.search != null) {
      const userIds: Set<number> = new Set<number>();
      const requestSearchUser = {
        search: request.search,
        headers: request.headers,
      };
      try {
        const searchUserResponse: IMessage = await getInstance().sendRequestAsync(
          `${transactionId}`,
          'user',
          'get:/api/v1/user/friend/search',
          requestSearchUser
        );
        const data = Kafka.getResponse<any[]>(searchUserResponse);
        data.forEach((user: any) => {
          userIds.add(user.id);
        });
        filter = {
          ...filter,
          $in: Array.from(userIds),
        };
      } catch (err) {
        Logger.error(`${transactionId} fail to send message`, err);
        return [];
      }
    }
    const conversations: Conversation[] = await this.repository.find({
      where: {
        users: filter,
        sourceUser: userId,
        deletedAt: null,
      },
      order: { ['updatedAt']: 'DESC' },
      skip: offset,
      take: limit,
    });
    const total: number = await this.repository.count({
      users: filter,
      sourceUser: userId,
      deletedAt: null,
    });
    if (conversations.length <= 0) {
      return {
        total: total,
        datas: [],
        page: 0,
        totalPages: 0,
      };
    }
    const users: Set<number> = new Set<number>();
    conversations.forEach((conversation: Conversation) => {
      users.add(conversation.targetUser);
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
      const datas: any[] = [];
      conversations.forEach((conversation: Conversation) => {
        const userInfos: any[] = [];
        const targetInfo: any = mapUserInfos.get(conversation.targetUser);
        if (targetInfo && targetInfo.status === 'ACTIVE') {
          conversation.users.forEach((userId) => {
            const info: any = mapUserInfos.get(userId);
            if (info != null) {
              userInfos.push(info);
            }
          });
          datas.push({
            id: conversation.id,
            users: userInfos,
            lastMessage: conversation.messages[conversation.messages.length - 1],
          });
        }
      });
      return {
        total: total,
        datas: datas,
        page: Number(request.pageNumber),
        totalPages: Math.ceil(total / limit),
      };
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      return {
        total: 0,
        datas: [],
        page: 0,
        totalPages: 0,
      };
    }
  }

  public async deleteRoom(request: IChatRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.recipientId, 'recipientId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const conversation: Conversation = await this.repository.findOne({
      where: {
        sourceUser: userId,
        targetUser: request.recipientId,
      },
    });
    if (conversation == null) {
      throw new Errors.GeneralError(Constants.OBJECT_NOT_FOUND);
    }
    await this.repository.updateOne(
      {
        _id: conversation.id,
      },
      {
        $set: {
          deletedAt: new Date(),
          messages: [],
        },
      }
    );
    return {};
  }

  public async internalDeleteRoom(request: IChatRequest, transactionId: string | number, sourceId: string) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.recipientId, 'recipientId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    await this.repository.deleteMany({
      users: {
        $all: [userId, Number(request.recipientId)],
      },
    });
    this.publish('delete.room', { to: request.recipientId, data: { id: userId } }, sourceId);
    return {};
  }

  public async getMessagesByRoomId(request: IChatRequest, transactionId: string | number) {
    const invalidParams = new Errors.InvalidParameterError();
    Utils.validate(request.recipientId, 'recipientId').setRequire().throwValid(invalidParams);
    invalidParams.throwErr();
    const userId: number = request.headers.token.userData.id;
    const conversation: Conversation = await this.repository.findOne({
      where: {
        users: {
          $all: [userId, Number(request.recipientId)],
        },
        sourceUser: userId,
        targetUser: Number(request.recipientId),
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
      const responses: any[] = [];
      conversation.messages.forEach((message: Message, index: number) => {
        const userInfo = mapUserInfos.get(message.userId);
        if (userInfo && userInfo.status === 'ACTIVE') {
          responses.push({
            _id: message._id.toHexString(),
            user: {
              _id: message.userId,
              name: userInfo.name,
            },
            text: message.message,
            createdAt: message.createdAt,
          });
        }
      });
      return responses;
    } catch (err) {
      Logger.error(`${transactionId} fail to send message`, err);
      return [];
    }
  }

  public async deleteAll(request: any, transactionId: string | number) {
    const userIds = request.userIds;
    await Promise.all([
      this.repository.deleteMany({ users: { $ind: userIds } }),
      this.postRepository.deleteMany({ userId: { $ind: userIds } }),
      this.postRepository.updateMany(
        { 'comments.userId': { $ind: userIds } },
        { $pull: { comments: { userId: { $ind: userIds } } } }
      ),
      this.postRepository.updateMany(
        { 'reactions.userId': { $ind: userIds } },
        { $pull: { reactions: { userId: { $ind: userIds } } } }
      ),
      this.postRepository.updateMany({ tags: { $ind: userIds } }, { $pull: { tags: { userId: { $ind: userIds } } } }),
    ]);
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
    const userIds: number[] = [userId, Number(request.recipientId)];
    const conversations: Conversation = await this.repository.findOne({
      where: {
        users: {
          $all: userIds,
        },
      },
    });
    return { chatId: conversations != null ? conversations.id : null };
  }
}
