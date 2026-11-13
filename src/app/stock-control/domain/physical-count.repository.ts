import { PhysicalCount } from './model/physical-count.entity';

export type NewPhysicalCount = Omit<PhysicalCount, 'id'>;

export abstract class PhysicalCountRepository {
  abstract getAll(): Promise<PhysicalCount[]>;

  abstract create(count: NewPhysicalCount): Promise<PhysicalCount>;
}
