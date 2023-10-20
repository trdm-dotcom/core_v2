import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  ObjectID,
  ObjectIdColumn,
  Tree,
  TreeChildren,
  TreeParent,
} from 'typeorm';
import Post from './Post';

@Entity()
@Tree('nested-set')
export default class Comment {
  @ObjectIdColumn()
  id: ObjectID;
  @Column()
  userId: number;
  @Column()
  postId: number;
  @Column()
  comment: string;
  @TreeChildren()
  children: Comment[];
  @TreeParent()
  parent: Comment;
  @ManyToOne(() => Post, (post) => post.comments)
  post: Post;
  @CreateDateColumn()
  createdAt: Date;
}
