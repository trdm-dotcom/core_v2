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

Logger.create(config.logger.config, true);
Logger.info('Starting...');

async function run() {
  Logger.info('run service core');
  useContainer(ContainerTypeOrm);
  await createConnection({
    ...{
      type: 'mongodb',
      entities: [Post, Conversation],
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
