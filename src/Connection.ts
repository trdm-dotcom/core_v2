import { DataSource } from 'typeorm';
import config from './Config';
import Post from './models/entities/Post';
import Reaction from './models/entities/Reaction';
import Comment from './models/entities/Comment';

export const AppDataSource = new DataSource({
  ...{
    type: 'mysql',
    entities: [Post, Comment, Reaction],
  },
  ...config.datasource,
});
