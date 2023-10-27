import { Column, Entity, ObjectIdColumn, Tree, TreeChildren, TreeParent } from 'typeorm';
import { ObjectID } from 'mongodb';

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
  @Column()
  userId: number;
  @Column()
  createdAt: Date;
}
