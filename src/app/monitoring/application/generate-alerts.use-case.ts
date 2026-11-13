import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { GetProductsUseCase } from '../../catalog/application/get-products.use-case';
import { GetBatchesUseCase } from '../../inventory/application/get-batches.use-case';

import { AlertRepository, NewInventoryAlert } from '../domain/alert.repository';

@Injectable({ providedIn: 'root' })
export class GenerateAlertsUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly getProducts: GetProductsUseCase,
    private readonly getBatches: GetBatchesUseCase,
    private readonly alertRepository: AlertRepository,
  ) {}

  async execute(): Promise<number> {
    const operation = this.operationContext.captureOperation();
    const [products, batches, existingAlerts] = await Promise.all([
      this.getProducts.execute(),
      this.getBatches.execute(),
      this.alertRepository.getAll(),
    ]);
    operation.assertCurrent();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const candidates: NewInventoryAlert[] = [];

    for (const product of products.filter((p) => p.active)) {
      const productBatches = batches.filter((b) => String(b.productId) === String(product.id));

      const totalStock = productBatches.reduce((sum, batch) => sum + batch.availableQuantity, 0);

      if (totalStock < product.minimumStock) {
        candidates.push({
          productId: String(product.id),
          batchId: null,
          type: 'LOW_STOCK',
          severity: 'WARNING',
          message: `${product.name}: stock ${totalStock}, mínimo ${product.minimumStock}.`,
          createdAt: new Date().toISOString(),
          resolved: false,
        });
      }

      for (const batch of productBatches) {
        if (!batch.expirationDate || batch.availableQuantity <= 0) {
          continue;
        }

        const expiration = new Date(`${batch.expirationDate}T00:00:00`);

        const daysRemaining = Math.ceil((expiration.getTime() - today.getTime()) / 86400000);

        if (daysRemaining < 0) {
          candidates.push({
            productId: String(product.id),
            batchId: String(batch.id),
            type: 'EXPIRED',
            severity: 'CRITICAL',
            message: `${product.name}, lote ${batch.code}: vencido.`,
            createdAt: new Date().toISOString(),
            resolved: false,
          });
        } else if (daysRemaining <= 30) {
          candidates.push({
            productId: String(product.id),
            batchId: String(batch.id),
            type: 'EXPIRING',
            severity: 'WARNING',
            message: `${product.name}, lote ${batch.code}: vence en ${daysRemaining} días.`,
            createdAt: new Date().toISOString(),
            resolved: false,
          });
        }
      }
    }

    let created = 0;

    for (const candidate of candidates) {
      const exists = existingAlerts.some(
        (alert) =>
          String(alert.productId) === candidate.productId &&
          String(alert.batchId ?? '') === String(candidate.batchId ?? '') &&
          alert.type === candidate.type &&
          !alert.resolved,
      );

      if (!exists) {
        operation.assertCurrent();
        await this.alertRepository.create(candidate);
        operation.assertCurrent();
        created++;
      }
    }

    operation.assertCurrent();
    return created;
  }
}
