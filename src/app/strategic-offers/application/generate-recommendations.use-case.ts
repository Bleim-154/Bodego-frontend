import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { GetProductsUseCase } from '../../catalog/application/get-products.use-case';
import { GetBatchesUseCase } from '../../inventory/application/get-batches.use-case';

import { RecommendationRepository, NewRecommendation } from '../domain/recommendation.repository';

@Injectable({ providedIn: 'root' })
export class GenerateRecommendationsUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly getProducts: GetProductsUseCase,
    private readonly getBatches: GetBatchesUseCase,
    private readonly recommendations: RecommendationRepository,
  ) {}

  async execute(): Promise<number> {
    const operation = this.operationContext.captureOperation();
    const [products, batches, existing] = await Promise.all([
      this.getProducts.execute(),
      this.getBatches.execute(),
      this.recommendations.getAll(),
    ]);
    operation.assertCurrent();

    const candidates: NewRecommendation[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const product of products.filter((p) => p.active)) {
      const productBatches = batches.filter((b) => String(b.productId) === String(product.id));

      const stock = productBatches.reduce((total, batch) => total + batch.availableQuantity, 0);

      if (stock < product.minimumStock) {
        candidates.push({
          productId: String(product.id),
          batchId: null,
          type: 'RESTOCK',
          message: `${product.name}: reponer stock. Disponible: ${stock}, mínimo: ${product.minimumStock}.`,
          createdAt: new Date().toISOString(),
          dismissed: false,
        });
      }

      // Regla provisional: exceso = más del triple del mínimo.
      if (product.minimumStock > 0 && stock > product.minimumStock * 3) {
        candidates.push({
          productId: String(product.id),
          batchId: null,
          type: 'OVERSTOCK',
          message: `${product.name}: considerar una promoción. Stock actual: ${stock}.`,
          createdAt: new Date().toISOString(),
          dismissed: false,
        });
      }

      for (const batch of productBatches) {
        if (!batch.expirationDate || batch.availableQuantity <= 0) {
          continue;
        }

        const expiration = new Date(`${batch.expirationDate}T00:00:00`);

        const days = Math.round((expiration.getTime() - today.getTime()) / 86400000);

        if (days >= 0 && days <= 30) {
          candidates.push({
            productId: String(product.id),
            batchId: String(batch.id),
            type: 'EXPIRING',
            message: `${product.name}, lote ${batch.code}: vence en ${days} días. Considerar una oferta.`,
            createdAt: new Date().toISOString(),
            dismissed: false,
          });
        }
      }
    }

    let created = 0;

    for (const candidate of candidates) {
      const exists = existing.some(
        (item) =>
          String(item.productId) === candidate.productId &&
          String(item.batchId ?? '') === String(candidate.batchId ?? '') &&
          item.type === candidate.type &&
          !item.dismissed,
      );

      if (!exists) {
        operation.assertCurrent();
        await this.recommendations.create(candidate);
        operation.assertCurrent();
        created++;
      }
    }

    operation.assertCurrent();
    return created;
  }
}
