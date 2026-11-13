import { Injectable, inject } from '@angular/core';

import { StockAdjustment } from '../domain/model/stock-adjustment.entity';
import { StockAdjustmentRepository, NewStockAdjustment } from '../domain/stock-adjustment.repository';
import { StockAdjustmentsApiEndpoint } from './stock-adjustments-api-endpoint';
import { StockAdjustmentAssembler } from './assemblers/stock-adjustment.assembler';

@Injectable()
export class StockAdjustmentHttpRepository extends StockAdjustmentRepository {
  private readonly endpoint = inject(StockAdjustmentsApiEndpoint);

  override async getAll(): Promise<StockAdjustment[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => StockAdjustmentAssembler.toEntity(response));
  }

  override async create(data: NewStockAdjustment): Promise<StockAdjustment> {
    const response = await this.endpoint.create(data);
    return StockAdjustmentAssembler.toEntity(response);
  }
}
