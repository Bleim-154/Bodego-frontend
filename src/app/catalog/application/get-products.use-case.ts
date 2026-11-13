import { Injectable } from '@angular/core';

import { ProductRepository } from '../domain/product.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';

@Injectable({ providedIn: 'root' })
export class GetProductsUseCase {
  constructor(
    private readonly repository: ProductRepository,
    private readonly businessContext: BusinessContextService,
  ) {}

  async execute() {
    const operation = this.businessContext.captureOperation();
    const businessId = operation.businessId;

    const products = await this.repository.getAll();
    operation.assertCurrent();

    if (this.businessContext.requireBusinessId() !== businessId) {
      throw new Error('El negocio activo ha cambiado.');
    }

    operation.assertCurrent();
    return products.filter((product) => String(product.businessId) === businessId);
  }
}
