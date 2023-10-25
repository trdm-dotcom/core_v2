import { Column, Entity, ManyToOne, ObjectID, ObjectIdColumn, Tree, TreeChildren, TreeParent } from 'typeorm';
import Conversation from './Conversation';

@Entity()
@Tree('nested-set')
export class Message {
  @ObjectIdColumn()
  id: ObjectID;
  @Column()
  message: string;
  @TreeChildren()
  children: Message[];
  @TreeParent()
  parent: Message;
  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  conversation: Conversation;
  @Column()
  userId: number;
  @Column()
  createdAt: Date;
}
