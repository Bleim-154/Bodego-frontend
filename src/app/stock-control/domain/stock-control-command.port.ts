import { PhysicalCount } from './model/physical-count.entity';
import { StockAdjustment } from './model/stock-adjustment.entity';
import { Waste, WasteReason } from './model/waste.entity';
import { CorrectionRequest } from './model/correction-request.entity';

/** Inputs only: the server owns stock snapshots, dates, movements and audit. */
export abstract class StockControlCommandPort {
  abstract count(input: {
    batchId: string;
    countedQuantity: number;
    observation: string | null;
  }): Promise<PhysicalCount>;
  abstract adjust(physicalCountId: string, reason: string): Promise<StockAdjustment>;
  abstract waste(input: {
    batchId: string;
    quantity: number;
    reason: WasteReason;
    observation: string | null;
  }): Promise<Waste>;
  abstract request(physicalCountId: string, reason: string): Promise<CorrectionRequest>;
  abstract review(id: string, approved: boolean, comment: string): Promise<CorrectionRequest>;
}
