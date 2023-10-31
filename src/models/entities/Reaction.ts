import { Column, CreateDateColumn, Entity, ObjectIdColumn } from 'typeorm';
import { ObjectID } from 'mongodb';

@Entity()
export default class Reaction {
  @ObjectIdColumn()
  _id: ObjectID;
  @Column()
  userId: number;
  @Column()
  reaction: string;
  @CreateDateColumn()
  createdAt: Date;
}
