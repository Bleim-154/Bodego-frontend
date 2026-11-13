import { User } from './model/user.entity';
export interface UserDirectoryPage {
  items: User[];
  page: number;
  size: number;
  hasNext: boolean;
}
export interface NewEmployee {
  fullName: string;
  email: string;
  password: string;
}
export abstract class UserDirectoryPort {
  abstract getPage(page: number, size: number): Promise<UserDirectoryPage>;
  abstract getById(id: string): Promise<User>;
  abstract changeStatus(id: string, active: boolean): Promise<User>;
}
export abstract class EmployeeCreationPort {
  abstract createEmployee(input: NewEmployee): Promise<User>;
}
