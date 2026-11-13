import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { PhysicalCountRepository } from '../domain/physical-count.repository';
import { StockAdjustmentRepository } from '../domain/stock-adjustment.repository';
import { StockAdjustment } from '../domain/model/stock-adjustment.entity';
import { RegisterInventoryMovementUseCase } from '../../inventory/application/register-inventory-movement.use-case';
import { RegisterAuditLogUseCase } from '../../monitoring/application/register-audit-log.use-case';
import { BatchAccessService } from '../../inventory/application/batch-access.service';

@Injectable({ providedIn: 'root' })
export class ApplyStockAdjustmentUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly batchRepository: BatchRepository,
    private readonly countRepository: PhysicalCountRepository,
    private readonly adjustmentRepository: StockAdjustmentRepository,
    private readonly registerMovement: RegisterInventoryMovementUseCase,
    private readonly auditLog: RegisterAuditLogUseCase,
    private readonly batchAccess: BatchAccessService,
  ) {}

  async execute(physicalCountId: string, reason: string): Promise<StockAdjustment> {
    const operation = this.operationContext.captureOperation();
    operation.assertRole('ADMIN');
    const audit = this.auditLog.forOperation();
    if (!physicalCountId.trim() || !reason.trim()) {
      throw new Error('Seleccione un conteo e ingrese el motivo.');
    }

    const counts = await this.countRepository.getAll();
    operation.assertRole('ADMIN');
    const count = counts.find((item) => String(item.id) === String(physicalCountId));

    if (!count) {
      throw new Error('Conteo físico no encontrado.');
    }

    await this.batchAccess.assertAccess(String(count.batchId));
    operation.assertRole('ADMIN');

    const previousAdjustments = await this.adjustmentRepository.getAll();
    operation.assertRole('ADMIN');

    if (
      previousAdjustments.some((item) => String(item.physicalCountId) === String(physicalCountId))
    ) {
      throw new Error('Este conteo ya tiene un ajuste registrado.');
    }

    const batch = await this.batchRepository.getById(count.batchId);
    operation.assertRole('ADMIN');

    if (batch.availableQuantity !== count.systemQuantity) {
      throw new Error('El stock cambió desde el conteo. Realice un nuevo conteo físico.');
    }

    if (count.difference === 0) {
      throw new Error('El conteo no presenta diferencias.');
    }

    await this.registerMovement.executeForStockAdjustment({
      batchId: batch.id,
      type: count.difference > 0 ? 'IN' : 'OUT',
      quantity: Math.abs(count.difference),
      reason: `Ajuste por conteo ${physicalCountId}: ${reason.trim()}`,
    });

    operation.assertRole('ADMIN');
    const adjustment = await this.adjustmentRepository.create({
      physicalCountId: String(count.id),
      batchId: String(batch.id),
      previousQuantity: batch.availableQuantity,
      newQuantity: count.countedQuantity,
      difference: count.difference,
      reason: reason.trim(),
      adjustedAt: new Date().toISOString(),
    });

    await audit.execute({
      action: 'STOCK_ADJUSTED',
      entityType: 'StockAdjustment',
      entityId: adjustment.id,
      description:
        `Ajuste del lote ${batch.code}: ` +
        `${batch.availableQuantity} → ${count.countedQuantity} unidades.`,
    });

    operation.assertRole('ADMIN');
    return adjustment;
  }
}
