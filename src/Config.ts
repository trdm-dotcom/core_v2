import { Utils } from 'common';

let config = {
  logger: {
    config: {
      appenders: {
        application: { type: 'console' },
        file: {
          type: 'file',
          filename: './../logs/user/application.log',
          compression: true,
          maxLogSize: 10485760,
          backups: 100,
        },
      },
      categories: {
        default: { appenders: ['application', 'file'], level: 'info' },
      },
    },
  },
  topic: {
    pushNotification: 'notification-manager',
  },
  clusterId: 'core',
  clientId: `core-${Utils.getEnvNum('ENV_NODE_ID')}`,
  nodeId: Utils.getEnvNum('ENV_NODE_ID'),
  kafkaUrls: Utils.getEnvArr('ENV_KAFKA_URLS'),
  kafkaCommonOptions: {},
  kafkaConsumerOptions: {},
  kafkaProducerOptions: {},
  kafkaTopicOptions: {},
  requestHandlerTopics: [],
  redis: {
    url: `redis://${Utils.getEnvStr('ENV_REDIS_HOST')}:${Utils.getEnvStr('ENV_REDIS_PORT')}`,
  },
  mongo: {
    host: Utils.getEnvStr('ENV_MONGO_HOST'),
    port: Utils.getEnvNum('ENV_MONGO_PORT'),
    authSource: 'admin',
    username: Utils.getEnvStr('ENV_MONGO_USER'),
    password: Utils.getEnvStr('ENV_MONGO_PASSWORD'),
    useNewUrlParser: true,
    useUnifiedTopology: true,
    synchronize: false,
    database: 'core',
    poolSize: 100,
  },
  app: {
    cacheTTL: 300000, //milliseconds
    timeStampHash: 30000, //milliseconds
    defaultPageOffset: 0,
    defaultPageSize: 20,
  },
  key: {
    rsa: {
      publicKey: './../external/key/rsa_public.key',
      privateKey: './../external/key/rsa_private.key',
    },
    aes: {
      key: 'IaPON8rXjCQ5TIUVYBtcw8WKGCfcQEtc',
      iv: 'jI4j7fqHWO',
      keyHash: 'wfyxb3sR1O',
    },
  },
};

config.kafkaConsumerOptions = {
  ...(config.kafkaCommonOptions ? config.kafkaCommonOptions : {}),
  ...(config.kafkaConsumerOptions ? config.kafkaConsumerOptions : {}),
};
config.kafkaProducerOptions = {
  ...(config.kafkaCommonOptions ? config.kafkaCommonOptions : {}),
  ...(config.kafkaProducerOptions ? config.kafkaProducerOptions : {}),
};

if (config.requestHandlerTopics.length == 0) {
  config.requestHandlerTopics.push(config.clusterId);
}

export default config;
