import { Errors, Logger } from 'common';
import { Inject, Service } from 'typedi';
import config from '../Config';
import PostService from '../services/PostService';
import ReactionService from '../services/ReactionService';
import { Kafka } from 'kafka-common';
import { getInstance } from '../services/KafkaProducerService';
import { MessageSetEntry } from 'kafka-common/build/src/modules/kafka';

@Service()
export default class RequestHandler {
  @Inject()
  postService: PostService;
  @Inject()
  reactionService: ReactionService;

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
          return this.postService.store(message.data, message.messageId);

        case 'delete:/api/v1/social/post':
          return this.postService.delete(message.data, message.messageId);

        case 'put:/api/v1/social/post':
          return this.postService.update(message.data, message.messageId);

        case 'post:/api/v1/social/comment':
          return this.reactionService.comment(message.data, message.messageId);

        case 'post:/api/v1/social/reaction':
          return this.reactionService.reaction(message.data, message.messageId);

        default:
          return false;
      }
    }
  };
}
