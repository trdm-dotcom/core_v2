import { Errors, Logger } from 'common';
import { Inject, Service } from 'typedi';
import config from '../Config';
import PostService from '../services/PostService';
import { Kafka } from 'kafka-common';
import { getInstance } from '../services/KafkaProducerService';
import { MessageSetEntry } from 'kafka-common/build/src/modules/kafka';
import ConversationService from '../services/ConversationService';

const { UriNotFound } = Errors;

@Service()
export default class RequestHandler {
  @Inject()
  postService: PostService;
  @Inject()
  conversationService: ConversationService;

  public init() {
    const handle: Kafka.KafkaRequestHandler = new Kafka.KafkaRequestHandler(getInstance());
    new Kafka.KafkaConsumer(config).startConsumer([config.clusterId], (message: MessageSetEntry) =>
      handle.handle(message, this.handleRequest)
    );
  }

  private handleRequest: Kafka.Handle = async (message: Kafka.IMessage) => {
    Logger.info(`Endpoint received message: ${JSON.stringify(message)}`);
    if (message == null || message.data == null) {
      return Promise.reject(new Errors.SystemError());
    } else {
      switch (message.uri) {
        case 'post:/api/v1/social/post':
          return this.postService.store(message.data, message.transactionId);

        case 'delete:/api/v1/social/post':
          return this.postService.delete(message.data, message.transactionId);

        case 'put:/api/v1/social/post':
          return this.postService.update(message.data, message.transactionId);

        case 'get:/api/v1/social/post':
          return this.postService.get(message.data, message.transactionId);

        case 'get:/api/v1/social/post/tag':
          return this.postService.getPostByTag(message.data, message.transactionId);

        case 'get:/api/v1/social/post/detail':
          return this.postService.getDetail(message.data, message.transactionId);

        case 'put:/api/v1/social/post/disable':
          return this.postService.disable(message.data, message.transactionId);

        case 'post:/api/v1/social/comment':
          return this.postService.comment(message.data, message.transactionId, message.sourceId);

        case 'get:/api/v1/social/post/comments':
          return this.postService.getCommentsOfPost(message.data, message.transactionId);

        case 'delete:/api/v1/social/post/comments':
          return this.postService.deleteComment(message.data, message.transactionId);

        case 'post:/api/v1/social/reaction':
          return this.postService.reaction(message.data, message.transactionId, message.sourceId);

        case 'get:/api/v1/social/post/reactions':
          return this.postService.getReactionsOfPost(message.data, message.transactionId);

        case 'get:/api/v1/social/post/user':
          return this.postService.getPostOfUser(message.data, message.transactionId);

        case 'post:/api/v1/chat/message':
          return this.conversationService.sendMessage(message.data, message.sourceId, message.transactionId);

        case 'get:/api/v1/chat/conversation':
          return this.conversationService.getConversations(message.data, message.transactionId);

        case 'delete:/api/v1/chat/conversation':
          return this.conversationService.deleteRoom(message.data, message.transactionId, message.sourceId);

        case 'internal:/api/v1/chat/conversation/delete':
          return this.conversationService.internalDeleteRoom(message.data, message.transactionId, message.sourceId);

        case 'get:/api/v1/chat/conversation/messages':
          return this.conversationService.getMessagesByRoomId(message.data, message.transactionId);

        case 'internal:/api/v1/conversation/deleteAll':
          return this.conversationService.deleteAll(message.data, message.transactionId);

        case 'get:/api/v1/chat/conversation/between':
          return this.conversationService.getConversationBetween(message.data, message.transactionId);

        default:
          throw new UriNotFound();
      }
    }
  };
}
