import { User } from './model/user.entity';

export type NewUser = Omit<User, 'id'>;

export type UserChanges = Pick<User, 'businessId' | 'fullName' | 'email' | 'role'>;

export abstract class UserRepository {
  abstract getAll(): Promise<User[]>;
  abstract getById(id: string): Promise<User>;
  abstract create(data: NewUser): Promise<User>;
  abstract update(id: string, changes: UserChanges): Promise<User>;
  abstract changeStatus(id: string, active: boolean): Promise<User>;
}
