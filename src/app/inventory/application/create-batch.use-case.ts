import { Injectable } from '@angular/core';

import { Batch } from '../domain/model/batch.entity';
import { BatchRepository } from '../domain/batch.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';

export interface CreateBatchCommand {
  productId: string;
  code: string;
  entryDate: string;
  expirationDate: string | null;
}

@Injectable({ providedIn: 'root' })
export class CreateBatchUseCase {
  constructor(
    private readonly repository: BatchRepository,
    private readonly productRepository: ProductRepository,
    private readonly businessContext: BusinessContextService,
  ) {}

  async execute(command: CreateBatchCommand): Promise<Batch> {
    const operation = this.businessContext.captureOperation();
    if (!command.productId.trim()) {
      throw new Error('Seleccione un producto.');
    }

    if (!command.code.trim()) {
      throw new Error('Ingrese el código del lote.');
    }

    if (!command.entryDate) {
      throw new Error('Ingrese la fecha de ingreso.');
    }

    if (command.expirationDate && command.expirationDate < command.entryDate) {
      throw new Error('El vencimiento no puede ser anterior al ingreso.');
    }

    const product = await this.productRepository.getById(command.productId);
    operation.assertCurrent();

    if (!this.businessContext.belongsToBusiness(product.businessId)) {
      throw new Error('No puede crear lotes para productos de otro negocio.');
    }

    operation.assertCurrent();
    return operation.complete(this.repository.create({
      productId: command.productId,
      code: command.code.trim(),
      availableQuantity: 0,
      entryDate: command.entryDate,
      expirationDate: command.expirationDate || null,
    }));
  }
}
