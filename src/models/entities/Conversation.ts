import { Column, CreateDateColumn, Entity, ObjectIdColumn, UpdateDateColumn } from 'typeorm';

import { ObjectID } from 'mongodb';
import { Message } from './Message';

@Entity()
export default class Conversation {
  @ObjectIdColumn()
  id: ObjectID;
  @Column({ array: true })
  users: number[];
  @Column((type) => Message, { array: true })
  messages: Message[];
  @Column()
  seen: boolean;
  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
  @Column('json')
  deletedAt: { [userId: number]: Date };
}
