import { Batch } from './model/batch.entity';

export abstract class BatchRepository {
  abstract getAll(): Promise<Batch[]>;
  abstract getById(id: string): Promise<Batch>;
  abstract create(batch: Omit<Batch, 'id'>): Promise<Batch>;
  abstract updateQuantity(id: string, quantity: number): Promise<Batch>;
}
