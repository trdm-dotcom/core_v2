import { Column, Entity, ObjectID, ObjectIdColumn } from 'typeorm';

@Entity()
export class Message {
  @ObjectIdColumn()
  id: ObjectID;
  @Column()
  message: string;
  @Column()
  userId: number;
  @Column()
  createdAt: Date;
}
