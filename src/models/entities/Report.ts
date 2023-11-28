import { Column, CreateDateColumn, Entity, ObjectID, ObjectIdColumn, UpdateDateColumn } from 'typeorm';
import Post from './Post';

@Entity()
export default class Report {
  @ObjectIdColumn()
  id: ObjectID;
  @Column((type) => Post)
  source: Post;
  @Column()
  reason: string;
  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
