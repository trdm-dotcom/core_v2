import { Inject, Service } from 'typedi';
import RedisService from './RedisService';
import { Logger } from 'common';
import config from '../Config';

@Service()
export default class CacheService {
  @Inject()
  private redisService: RedisService;

  public async findInprogessValidate(key: any, type: string, transactionId: string | number) {
    Logger.info(`${transactionId} find inprogess type ${type} key ${key}`);
    let realKey: string = `${type}_${key}`;
    return await this.redisService.get<any>(realKey);
  }

  public addInprogessValidate(key: any, type: string, transactionId: string | number) {
    Logger.info(`${transactionId} add inprogess type ${type} key ${key}`);
    let realKey: string = `${type}_${key}`;
    this.redisService.set(realKey, key, { PX: config.app.cacheTTL });
  }

  public removeInprogessValidate(key: any, type: string, transactionId: string | number) {
    Logger.info(`${transactionId} remove inprogess type ${type} key ${key}`);
    let realKey: string = `${type}_${key}`;
    this.redisService.set(realKey, '', { PX: -1 });
  }
}
