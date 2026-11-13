import { inject, Injectable } from '@angular/core';
import { Batch } from '../../domain/model/batch.entity';
import { BatchRepository } from '../../domain/batch.repository';
import {
  BatchMetadataChanges,
  BatchMetadataRepository,
} from '../../domain/batch-metadata.repository';
import { backendIdentifier as catalogId } from '../../../shared/infrastructure/backend-identifier';
import { InventoryBackendGateway } from './inventory-backend.gateway';
import { batchFromBackend, inventoryCode, inventoryDate } from './inventory-backend.contract';

@Injectable()
export class SpringBatchHttpRepository extends BatchRepository implements BatchMetadataRepository {
  private readonly gateway = inject(InventoryBackendGateway);

  override async getAll(): Promise<Batch[]> {
    const operation = this.gateway.capture();
    const response = await this.gateway.request(operation, 'GET', '/lots');
    operation.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de inventario no válida.');
    return response.map((row) => batchFromBackend(row, operation.businessId));
  }

  override async getById(id: string): Promise<Batch> {
    const operation = this.gateway.capture();
    const key = String(catalogId(id));
    const response = await this.gateway.request(operation, 'GET', `/lots/${key}`);
    operation.assertCurrent();
    return batchFromBackend(response, operation.businessId, key);
  }

  override async create(batch: Omit<Batch, 'id'>): Promise<Batch> {
    const operation = this.gateway.capture('manage');
    if (batch.availableQuantity !== 0)
      throw new Error('Los lotes nuevos deben comenzar sin stock.');
    if (batch.entryDate !== '') throw new Error('El backend no admite fecha de ingreso del lote.');
    const response = await this.gateway.request(operation, 'POST', '/lots', {
      businessId: catalogId(operation.businessId),
      productId: catalogId(batch.productId),
      batchNumber: inventoryCode(batch.code),
      quantity: 0,
      expirationDate: inventoryDate(batch.expirationDate),
    });
    operation.assertCurrent();
    return batchFromBackend(response, operation.businessId);
  }

  override async updateQuantity(_id: string, _quantity: number): Promise<Batch> {
    throw new Error('El stock real solo se modifica mediante operaciones del backend.');
  }

  async updateMetadata(id: string, changes: BatchMetadataChanges): Promise<Batch> {
    const operation = this.gateway.capture('manage');
    const key = String(catalogId(id));
    const response = await this.gateway.request(operation, 'PUT', `/lots/${key}`, {
      batchNumber: inventoryCode(changes.code),
      expirationDate: inventoryDate(changes.expirationDate),
    });
    operation.assertCurrent();
    return batchFromBackend(response, operation.businessId, key);
  }
}
