import { Column, CreateDateColumn, Entity, ManyToOne, ObjectID, ObjectIdColumn } from 'typeorm';
import Post from './Post';

@Entity()
export default class Reaction {
  @ObjectIdColumn()
  id: ObjectID;
  @Column()
  userId: number;
  @ManyToOne(() => Post, (post) => post.reactions)
  post: Post;
  @Column()
  reaction: string;
  @CreateDateColumn()
  createdAt: Date;
}
