import { Column, CreateDateColumn, Entity, ObjectID, ObjectIdColumn, UpdateDateColumn } from 'typeorm';
import Reaction from './Reaction';
import Comment from './Comment';

@Entity()
export default class Post {
  @ObjectIdColumn()
  id: ObjectID;
  @Column()
  userId: number;
  @Column()
  caption: string;
  @Column()
  source: string;
  @Column()
  disable: boolean;
  @Column((type) => Comment, { array: true })
  comments: Comment[];
  @Column((type) => Reaction, { array: true })
  reactions: Reaction[];
  @Column((type) => Number, { array: true })
  tags: number[];
  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
