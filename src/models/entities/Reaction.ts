import { Column, CreateDateColumn, Entity, ObjectID, ObjectIdColumn } from 'typeorm';

@Entity()
export default class Reaction {
  @ObjectIdColumn()
  id: ObjectID;
  @Column()
  userId: number;
  @Column()
  reaction: string;
  @CreateDateColumn()
  createdAt: Date;
}
