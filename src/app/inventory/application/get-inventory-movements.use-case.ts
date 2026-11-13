import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { InventoryMovement } from '../domain/model/inventory-movement.entity';
import { InventoryMovementRepository } from '../domain/inventory-movement.repository';
import { GetBatchesUseCase } from './get-batches.use-case';

@Injectable({ providedIn: 'root' })
export class GetInventoryMovementsUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: InventoryMovementRepository,
    private readonly getBatches: GetBatchesUseCase,
  ) {}

  async execute(): Promise<InventoryMovement[]> {
    const operation = this.operationContext.captureOperation();
    const [movements, batches] = await Promise.all([
      this.repository.getAll(),
      this.getBatches.execute(),
    ]);
    operation.assertCurrent();

    const batchIds = new Set(batches.map((batch) => String(batch.id)));

    operation.assertCurrent();
    return movements.filter((movement) => batchIds.has(String(movement.batchId)));
  }
}
