import { ObjectId } from 'mongodb';
import { Column, CreateDateColumn, Entity, ObjectIdColumn } from 'typeorm';

@Entity()
export default class Comment {
  @ObjectIdColumn()
  id: ObjectId;
  @Column()
  userId: number;
  @Column()
  postId: number;
  @Column()
  comment: string;
  @Column((type) => Comment)
  commentReplies: Comment[];
  @CreateDateColumn()
  createdAt: Date;
}
