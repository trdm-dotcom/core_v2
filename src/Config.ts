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
  clientId: `core-${Utils.getEnvNum('ENV_NODE_ID', 0)}`,
  nodeId: Utils.getEnvNum('ENV_NODE_ID', 0),
  kafkaUrls: Utils.getEnvArr('ENV_KAFKA_URLS', ['localhost:9092']),
  kafkaCommonOptions: {},
  kafkaConsumerOptions: {},
  kafkaProducerOptions: {},
  kafkaTopicOptions: {},
  requestHandlerTopics: [],
  redis: {
    url: `redis://${Utils.getEnvStr('ENV_REDIS_HOST', 'localhost')}:${Utils.getEnvStr('ENV_REDIS_PORT', '6379')}`,
  },
  datasource: {
    host: Utils.getEnvStr('ENV_MYSQL_HOST', 'localhost'),
    port: Utils.getEnvNum('ENV_MYSQL_PORT', 3306),
    username: Utils.getEnvStr('ENV_MYSQL_USER', 'root'),
    password: Utils.getEnvStr('ENV_MYSQL_PASSWORD', 'admin'),
    database: 'core',
    timezone: 'UTC',
    synchronize: false,
    logging: false,
    poolSize: 10,
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
