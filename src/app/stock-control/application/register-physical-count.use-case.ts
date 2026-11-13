import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { PhysicalCountRepository } from '../domain/physical-count.repository';
import { PhysicalCount } from '../domain/model/physical-count.entity';
import { BatchAccessService } from '../../inventory/application/batch-access.service';

export interface RegisterPhysicalCountCommand {
  batchId: string;
  countedQuantity: number;
  observation: string | null;
}
// Importante: registrar un conteo no modifica el stock. Solo registra la diferencia encontrada.
@Injectable({ providedIn: 'root' })
export class RegisterPhysicalCountUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly batchRepository: BatchRepository,
    private readonly countRepository: PhysicalCountRepository,
    private readonly batchAccess: BatchAccessService,
  ) {}

  async execute(command: RegisterPhysicalCountCommand): Promise<PhysicalCount> {
    const operation = this.operationContext.captureOperation();
    if (!command.batchId.trim()) {
      throw new Error('Seleccione un lote.');
    }

    if (!Number.isInteger(command.countedQuantity) || command.countedQuantity < 0) {
      throw new Error('La cantidad contada debe ser un entero no negativo.');
    }

    await this.batchAccess.assertAccess(command.batchId);
    operation.assertCurrent();

    const batch = await this.batchRepository.getById(command.batchId);
    operation.assertCurrent();

    const difference = command.countedQuantity - batch.availableQuantity;

    operation.assertCurrent();
    return operation.complete(this.countRepository.create({
      batchId: batch.id,
      systemQuantity: batch.availableQuantity,
      countedQuantity: command.countedQuantity,
      difference,
      observation: command.observation?.trim() || null,
      countedAt: new Date().toISOString(),
    }));
  }
}
