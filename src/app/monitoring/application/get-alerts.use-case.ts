import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { AlertRepository } from '../domain/alert.repository';
import { GetProductsUseCase } from '../../catalog/application/get-products.use-case';

@Injectable({ providedIn: 'root' })
export class GetAlertsUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: AlertRepository,
    private readonly getProducts: GetProductsUseCase,
  ) {}

  async execute() {
    const operation = this.operationContext.captureOperation();
    const [alerts, products] = await Promise.all([
      this.repository.getAll(),
      this.getProducts.execute(),
    ]);
    operation.assertCurrent();

    const productIds = new Set(products.map((product) => String(product.id)));

    operation.assertCurrent();
    return alerts.filter((alert) => productIds.has(String(alert.productId)));
  }
}
