import { Waste } from './model/waste.entity';

export type NewWaste = Omit<Waste, 'id'>;

export abstract class WasteRepository {
  abstract getAll(): Promise<Waste[]>;
  abstract create(waste: NewWaste): Promise<Waste>;
}
