import { Column, CreateDateColumn, Entity, ObjectID, ObjectIdColumn, UpdateDateColumn } from 'typeorm';
import Reaction from './Reaction';
import Comment from './Comment';

@Entity()
export default class Post {
  @ObjectIdColumn()
  _id: ObjectID;
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
  @Column({ array: true })
  tags: number[];
  @Column({ array: true })
  hashtags: string[];
  @Column({ array: true })
  mentions: number[];
  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
