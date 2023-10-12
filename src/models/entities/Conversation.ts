import { ObjectId } from 'mongodb';
import { Column, CreateDateColumn, Entity, ObjectIdColumn, UpdateDateColumn } from 'typeorm';
import { Message } from './Message';

@Entity()
export default class Conversation {
  @ObjectIdColumn()
  id: ObjectId;
  @Column()
  group: boolean;
  @Column({ array: true })
  users: number[];
  @Column((type) => Message, { array: true })
  messages: Message[];
  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
