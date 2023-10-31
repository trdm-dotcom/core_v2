import { Column, CreateDateColumn, Entity, ObjectIdColumn, Tree, TreeChildren, TreeParent } from 'typeorm';
import { ObjectID } from 'mongodb';

@Entity()
@Tree('nested-set')
export default class Comment {
  @ObjectIdColumn()
  _id: ObjectID;
  @Column()
  userId: number;
  @Column()
  comment: string;
  @TreeChildren()
  children: Comment[];
  @TreeParent()
  parent: Comment;
  @CreateDateColumn()
  createdAt: Date;
}
