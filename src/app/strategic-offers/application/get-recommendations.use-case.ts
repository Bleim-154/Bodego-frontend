import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { RecommendationRepository } from '../domain/recommendation.repository';
import { GetProductsUseCase } from '../../catalog/application/get-products.use-case';

@Injectable({ providedIn: 'root' })
export class GetRecommendationsUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: RecommendationRepository,
    private readonly getProducts: GetProductsUseCase,
  ) {}

  async execute() {
    const operation = this.operationContext.captureOperation();
    const [recommendations, products] = await Promise.all([
      this.repository.getAll(),
      this.getProducts.execute(),
    ]);
    operation.assertCurrent();

    const productIds = new Set(products.map((product) => String(product.id)));

    operation.assertCurrent();
    return recommendations.filter((recommendation) => productIds.has(String(recommendation.productId)));
  }
}
