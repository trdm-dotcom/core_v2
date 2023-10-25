import { Column, CreateDateColumn, Entity, ObjectID, ObjectIdColumn, OneToMany, UpdateDateColumn } from 'typeorm';
import { Message } from './Message';

@Entity()
export default class Conversation {
  @ObjectIdColumn()
  id: ObjectID;
  @Column()
  group: boolean;
  @Column({ array: true })
  users: number[];
  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];
  @Column()
  seen: boolean;
  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
