import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { Waste } from '../domain/model/waste.entity';
import { WasteRepository } from '../domain/waste.repository';
import { GetBatchesUseCase } from '../../inventory/application/get-batches.use-case';

@Injectable({ providedIn: 'root' })
export class GetWastesUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: WasteRepository,
    private readonly getBatches: GetBatchesUseCase,
  ) {}

  async execute(): Promise<Waste[]> {
    const operation = this.operationContext.captureOperation();
    const [wastes, batches] = await Promise.all([
      this.repository.getAll(),
      this.getBatches.execute(),
    ]);
    operation.assertCurrent();

    const allowedBatchIds = new Set(batches.map((batch) => String(batch.id)));

    operation.assertCurrent();
    return wastes.filter((waste) => allowedBatchIds.has(String(waste.batchId)));
  }
}
