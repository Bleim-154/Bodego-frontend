import { inject, Injectable } from '@angular/core';
import { PhysicalCountRepository, NewPhysicalCount } from '../../domain/physical-count.repository';
import {
  StockAdjustmentRepository,
  NewStockAdjustment,
} from '../../domain/stock-adjustment.repository';
import { WasteRepository, NewWaste } from '../../domain/waste.repository';
import {
  CorrectionRequestRepository,
  NewCorrectionRequest,
} from '../../domain/correction-request.repository';
import { CorrectionRequest } from '../../domain/model/correction-request.entity';
import { StockControlBackendGateway } from './stock-control-backend.gateway';
import {
  countFromBackend,
  adjustmentFromBackend,
  wasteFromBackend,
  correctionFromBackend,
} from './stock-control-backend.contract';

async function list<T>(
  gateway: StockControlBackendGateway,
  path: string,
  map: (value: unknown, business: string) => T,
  admin = false,
): Promise<T[]> {
  const op = gateway.capture(admin);
  const response = await gateway.request(op, 'GET', path);
  op.assertCurrent();
  if (!Array.isArray(response)) throw new Error('Respuesta de control de stock no válida.');
  return response.map((row) => map(row, op.businessId));
}
function serverCommandOnly(): never {
  throw new Error('Utilice el comando del backend; no se admiten escrituras simuladas.');
}

@Injectable()
export class SpringPhysicalCountRepository extends PhysicalCountRepository {
  private readonly gateway = inject(StockControlBackendGateway);
  getAll() {
    return list(this.gateway, '/physical-counts', countFromBackend);
  }
  async create(_input: NewPhysicalCount): Promise<never> {
    return serverCommandOnly();
  }
}
@Injectable()
export class SpringStockAdjustmentRepository extends StockAdjustmentRepository {
  private readonly gateway = inject(StockControlBackendGateway);
  getAll() {
    return list(this.gateway, '/stock-adjustments', adjustmentFromBackend, true);
  }
  async create(_input: NewStockAdjustment): Promise<never> {
    return serverCommandOnly();
  }
}
@Injectable()
export class SpringWasteRepository extends WasteRepository {
  private readonly gateway = inject(StockControlBackendGateway);
  getAll() {
    return list(this.gateway, '/wastes', wasteFromBackend);
  }
  async create(_input: NewWaste): Promise<never> {
    return serverCommandOnly();
  }
}
@Injectable()
export class SpringCorrectionRequestRepository extends CorrectionRequestRepository {
  private readonly gateway = inject(StockControlBackendGateway);
  getAll() {
    return list(this.gateway, '/correction-requests', correctionFromBackend);
  }
  async create(_input: NewCorrectionRequest): Promise<never> {
    return serverCommandOnly();
  }
  async update(_id: string, _changes: Partial<CorrectionRequest>): Promise<never> {
    return serverCommandOnly();
  }
}
