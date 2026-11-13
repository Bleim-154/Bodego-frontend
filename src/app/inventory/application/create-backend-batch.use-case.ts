import { inject, Injectable } from '@angular/core';
import { BatchRepository } from '../domain/batch.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';
import { CreateBatchCommand, CreateBatchUseCase } from './create-batch.use-case';
import { Batch } from '../domain/model/batch.entity';

@Injectable()
export class CreateBackendBatchUseCase implements Pick<CreateBatchUseCase, 'execute'> {
  private readonly batches = inject(BatchRepository);
  private readonly products = inject(ProductRepository);
  private readonly context = inject(BusinessContextService);

  async execute(command: CreateBatchCommand): Promise<Batch> {
    const operation = this.context.captureOperation();
    operation.assertRole('ADMIN');
    if (command.entryDate !== '')
      throw new Error('El backend no admite fecha de ingreso del lote.');
    const product = await this.products.getById(command.productId);
    operation.assertCurrent();
    if (String(product.businessId) !== operation.businessId)
      throw new Error('No se encontró el recurso.');
    return operation.complete(
      this.batches.create({
        productId: product.id,
        code: command.code,
        availableQuantity: 0,
        entryDate: '',
        expirationDate: command.expirationDate,
      }),
    );
  }
}
