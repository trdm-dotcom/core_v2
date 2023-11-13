import { Column, CreateDateColumn, Entity, ObjectIdColumn } from 'typeorm';
import { ObjectID } from 'mongodb';

@Entity()
export default class Comment {
  @ObjectIdColumn()
  _id: ObjectID;
  @Column()
  userId: number;
  @Column()
  comment: string;
  @Column({ array: true })
  mentions: number[];
  @CreateDateColumn()
  createdAt: Date;
}
