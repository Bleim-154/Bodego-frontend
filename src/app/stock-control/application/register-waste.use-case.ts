import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';

import { BatchRepository } from '../../inventory/domain/batch.repository';
import { RegisterInventoryMovementUseCase } from '../../inventory/application/register-inventory-movement.use-case';

import { Waste, WasteReason } from '../domain/model/waste.entity';
import { WasteRepository } from '../domain/waste.repository';
import { RegisterAuditLogUseCase } from '../../monitoring/application/register-audit-log.use-case';
import { BatchAccessService } from '../../inventory/application/batch-access.service';

export interface RegisterWasteCommand {
  batchId: string;
  quantity: number;
  reason: WasteReason;
  observation: string | null;
}

@Injectable({ providedIn: 'root' })
export class RegisterWasteUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly batchRepository: BatchRepository,
    private readonly movementUseCase: RegisterInventoryMovementUseCase,
    private readonly wasteRepository: WasteRepository,
    private readonly auditLog: RegisterAuditLogUseCase,
    private readonly batchAccess: BatchAccessService,
  ) {}

  async execute(command: RegisterWasteCommand): Promise<Waste> {
    const operation = this.operationContext.captureOperation();
    const audit = this.auditLog.forOperation();
    if (!command.batchId.trim()) {
      throw new Error('Seleccione un lote.');
    }

    if (!Number.isInteger(command.quantity) || command.quantity <= 0) {
      throw new Error('La cantidad debe ser un entero positivo.');
    }

    const validReasons: WasteReason[] = ['EXPIRED', 'DAMAGED', 'DETERIORATED', 'OTHER'];

    if (!validReasons.includes(command.reason)) {
      throw new Error('Motivo de merma inválido.');
    }

    await this.batchAccess.assertAccess(command.batchId);
    operation.assertCurrent();

    const batch = await this.batchRepository.getById(command.batchId);
    operation.assertCurrent();

    if (command.quantity > batch.availableQuantity) {
      throw new Error('La merma supera el stock disponible.');
    }

    await this.movementUseCase.execute({
      batchId: batch.id,
      type: 'OUT',
      quantity: command.quantity,
      reason: `Merma (${command.reason}): ${command.observation || 'Sin observación'}`,
    });

    operation.assertCurrent();
    const waste = await this.wasteRepository.create({
      batchId: String(batch.id),
      quantity: command.quantity,
      reason: command.reason,
      observation: command.observation?.trim() || null,
      registeredAt: new Date().toISOString(),
    });

    await audit.execute({
      action: 'WASTE_REGISTERED',
      entityType: 'Waste',
      entityId: waste.id,
      description:
        `Merma de ${command.quantity} unidades ` +
        `del lote ${batch.code}. Motivo: ${command.reason}`,
    });

    operation.assertCurrent();
    return waste;
  }
}
