import { inject, Injectable } from '@angular/core';
import { InventoryMovementRepository } from '../domain/inventory-movement.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';
import {
  RegisterInventoryMovementUseCase,
  RegisterMovementCommand,
} from './register-inventory-movement.use-case';

/** One backend command owns stock + movement + audit. Never repeat those writes in Angular. */
@Injectable()
export class RegisterBackendInventoryMovementUseCase implements Pick<
  RegisterInventoryMovementUseCase,
  'execute' | 'executeForStockAdjustment'
> {
  private readonly movements = inject(InventoryMovementRepository);
  private readonly context = inject(BusinessContextService);

  async execute(command: RegisterMovementCommand): Promise<void> {
    const operation = this.context.captureOperation();
    await operation.complete(this.movements.create({ ...command, createdAt: '' }));
  }

  async executeForStockAdjustment(_command: RegisterMovementCommand): Promise<void> {
    throw new Error('El flujo real de ajustes de stock no está integrado en este lote.');
  }
}
