import { Column, CreateDateColumn, Entity, ObjectID, ObjectIdColumn, OneToMany, UpdateDateColumn } from 'typeorm';
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
  @OneToMany(() => Comment, (comment) => comment.post)
  comments: Comment[];
  @OneToMany(() => Reaction, (reaction) => reaction.post)
  reactions: Reaction[];
  @Column((type) => Number, { array: true })
  tags: number[];
  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
