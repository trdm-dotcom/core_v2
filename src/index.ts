import 'reflect-metadata';
import config from './Config';
import { Container } from 'typedi';
import { Logger } from 'common';
import RequestHandler from './consumers/RequestHandler';
import RedisService from './services/RedisService';
import { initKafka } from './services/KafkaProducerService';
import { createConnection, useContainer } from 'typeorm';
import { Container as ContainerTypeOrm } from 'typeorm-typedi-extensions';
import Post from './models/entities/Post';
import Conversation from './models/entities/Conversation';
import Reaction from './models/entities/Reaction';
import Comment from './models/entities/Comment';
import Report from './models/entities/Report';
import { Message } from './models/entities/Message';

Logger.create(config.logger.config, true);
Logger.info('Starting...');

async function run() {
  Logger.info('run service core');
  useContainer(ContainerTypeOrm);
  await createConnection({
    ...{
      type: 'mongodb',
      entities: [Post, Conversation, Comment, Reaction, Message, Report],
    },
    ...config.mongo,
  });
  initKafka();
  Container.get(RequestHandler).init();
  Container.get(RedisService).init();
}

run().catch((error) => {
  Logger.error(error);
});
