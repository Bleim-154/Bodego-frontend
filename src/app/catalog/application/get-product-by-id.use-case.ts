import { Injectable } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { Product } from '../domain/model/product.entity';
import { ProductRepository } from '../domain/product.repository';

@Injectable({
  providedIn: 'root',
})
export class GetProductByIdUseCase {
  constructor(private readonly productRepository: ProductRepository, private readonly businessContext: BusinessContextService) {}

  async execute(id: string): Promise<Product> {
    const operation = this.businessContext.captureOperation();
    if (!id.trim()) {
      throw new Error('El identificador del producto es obligatorio.');
    }

    const businessId = operation.businessId;
    const product = await this.productRepository.getById(id);
    operation.assertCurrent();
    if (String(product.businessId) !== businessId || this.businessContext.requireBusinessId() !== businessId) {
      throw new Error('No puede acceder a productos de otro negocio.');
    }
    operation.assertCurrent();
    return product;
  }
}
