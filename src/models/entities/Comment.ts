import { Column, CreateDateColumn, Entity, ObjectID, ObjectIdColumn, Tree, TreeChildren, TreeParent } from 'typeorm';

@Entity()
@Tree('nested-set')
export default class Comment {
  @ObjectIdColumn()
  id: ObjectID;
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
