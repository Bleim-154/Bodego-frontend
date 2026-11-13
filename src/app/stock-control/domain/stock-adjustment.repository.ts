import { StockAdjustment } from './model/stock-adjustment.entity';

export type NewStockAdjustment = Omit<StockAdjustment, 'id'>;

export abstract class StockAdjustmentRepository {
  abstract getAll(): Promise<StockAdjustment[]>;
  abstract create(data: NewStockAdjustment): Promise<StockAdjustment>;
}
