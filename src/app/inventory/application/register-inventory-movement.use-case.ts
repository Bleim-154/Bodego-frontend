import { Injectable } from '@angular/core';

import { BatchRepository } from '../domain/batch.repository';
import { InventoryMovementRepository } from '../domain/inventory-movement.repository';
import { MovementType } from '../domain/model/inventory-movement.entity';
import { RegisterAuditLogUseCase } from '../../monitoring/application/register-audit-log.use-case';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';

export interface RegisterMovementCommand {
  batchId: string;
  type: MovementType;
  quantity: number;
  reason: string;
}

@Injectable({ providedIn: 'root' })
export class RegisterInventoryMovementUseCase {
  constructor(
    private readonly batchRepository: BatchRepository,
    private readonly movementRepository: InventoryMovementRepository,
    private readonly auditLog: RegisterAuditLogUseCase,
    private readonly productRepository: ProductRepository,
    private readonly businessContext: BusinessContextService,
  ) {}

  execute(command: RegisterMovementCommand): Promise<void> {
    return this.register(command, false);
  }

  /** The adjustment path must keep ADMIN authorization between its stock writes. */
  executeForStockAdjustment(command: RegisterMovementCommand): Promise<void> {
    return this.register(command, true);
  }

  private async register(command: RegisterMovementCommand, adminOnly: boolean): Promise<void> {
    const operation = this.businessContext.captureOperation();
    const assertAllowed = (): void => {
      if (adminOnly) operation.assertRole('ADMIN');
      else operation.assertCurrent();
    };
    assertAllowed();
    const audit = this.auditLog.forOperation();
    if (!command.batchId.trim()) {
      throw new Error('Seleccione un lote.');
    }

    if (!['IN', 'OUT'].includes(command.type)) {
      throw new Error('Tipo de movimiento inválido.');
    }

    if (!Number.isInteger(command.quantity) || command.quantity <= 0) {
      throw new Error('La cantidad debe ser un entero positivo.');
    }

    if (!command.reason.trim()) {
      throw new Error('Ingrese el motivo del movimiento.');
    }

    const batch = await this.batchRepository.getById(command.batchId);
    assertAllowed();

    const product = await this.productRepository.getById(batch.productId);
    assertAllowed();

    if (!this.businessContext.belongsToBusiness(product.businessId)) {
      throw new Error('No puede registrar movimientos en lotes de otro negocio.');
    }

    const difference = command.type === 'IN' ? command.quantity : -command.quantity;

    const newQuantity = batch.availableQuantity + difference;

    if (newQuantity < 0) {
      throw new Error('Stock insuficiente para registrar la salida.');
    }

    const description =
      `${command.type === 'IN' ? 'Ingreso' : 'Salida'} ` +
      `de ${command.quantity} unidades. Motivo: ${command.reason}`;
    const recordAudit = (details = description) => audit.execute({
      action: 'INVENTORY_MOVEMENT',
      entityType: 'Batch',
      entityId: batch.id,
      description: details,
    });

    assertAllowed();
    await this.batchRepository.updateQuantity(batch.id, newQuantity);

    if (adminOnly) {
      try {
        assertAllowed();
      } catch (error) {
        // Stock was already written. Audit that effect as its original actor, without
        // starting a new movement/adjustment write under the replacement session.
        await recordAudit(
          `${description} Stock actualizado; registro del movimiento interrumpido por cambio de sesión.`);
        throw error;
      }
    }

    await this.movementRepository.create({
      batchId: batch.id,
      type: command.type,
      quantity: command.quantity,
      reason: command.reason.trim(),
      createdAt: new Date().toISOString(),
    });

    await recordAudit();
    assertAllowed();
  }
}
