import { Business } from './model/business.entity';

export type NewBusiness = Omit<Business, 'id'>;

export type BusinessChanges = Pick<Business, 'name' | 'address' | 'phone'>;

export abstract class BusinessRepository {
  abstract getAll(): Promise<Business[]>;
  abstract getById(id: string): Promise<Business>;
  abstract create(data: NewBusiness): Promise<Business>;
  abstract update(id: string, changes: BusinessChanges): Promise<Business>;
  abstract changeStatus(id: string, active: boolean): Promise<Business>;
}
