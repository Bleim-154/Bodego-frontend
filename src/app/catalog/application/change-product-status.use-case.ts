import { Injectable } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { Product } from '../domain/model/product.entity';
import { ProductRepository } from '../domain/product.repository';

import { ChangeProductStatusCommand } from './change-product-status.command';

@Injectable({
  providedIn: 'root',
})
export class ChangeProductStatusUseCase {
  constructor(private readonly productRepository: ProductRepository, private readonly businessContext: BusinessContextService) {}

  async execute(command: ChangeProductStatusCommand): Promise<Product> {
    const operation = this.businessContext.captureOperation();
    if (!command.id.trim()) {
      throw new Error('El identificador del producto es obligatorio.');
    }

    const businessId = operation.businessId;
    const product = await this.productRepository.getById(command.id);
    operation.assertCurrent();
    if (String(product.businessId) !== businessId || this.businessContext.requireBusinessId() !== businessId) {
      throw new Error('No puede acceder a productos de otro negocio.');
    }
    operation.assertCurrent();
    return operation.complete(this.productRepository.changeStatus(command.id, command.active));
  }
}
