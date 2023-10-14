import { Column, CreateDateColumn, Entity, ObjectID, ObjectIdColumn } from 'typeorm';

@Entity()
export default class Comment {
  @ObjectIdColumn()
  id: ObjectID;
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
