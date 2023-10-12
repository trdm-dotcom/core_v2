import { Column, CreateDateColumn, Entity } from 'typeorm';

@Entity()
export default class Reaction {
  @Column()
  userId: number;
  @Column()
  reaction: string;
  @CreateDateColumn()
  createdAt: Date;
}
