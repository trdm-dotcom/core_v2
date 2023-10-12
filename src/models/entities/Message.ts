import { Column, Entity } from 'typeorm';

@Entity()
export class Message {
  @Column()
  message: string;
  @Column()
  userId: number;
  @Column()
  createdAt: Date;
}
