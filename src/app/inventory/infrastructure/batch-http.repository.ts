import { Injectable, inject } from '@angular/core';

import { Batch } from '../domain/model/batch.entity';
import { BatchRepository } from '../domain/batch.repository';

import { BatchesApiEndpoint } from './batches-api-endpoint';
import { BatchAssembler } from './assemblers/batch.assembler';

@Injectable()
export class BatchHttpRepository extends BatchRepository {
  private readonly endpoint = inject(BatchesApiEndpoint);

  override async getAll(): Promise<Batch[]> {
    const responses = await this.endpoint.getAll();

    return responses.map((response) => BatchAssembler.toEntity(response));
  }

  override async getById(id: string): Promise<Batch> {
    const response = await this.endpoint.getById(id);

    return BatchAssembler.toEntity(response);
  }

  override async create(batch: Omit<Batch, 'id'>): Promise<Batch> {
    const response = await this.endpoint.create(batch);

    return BatchAssembler.toEntity(response);
  }

  override async updateQuantity(id: string, quantity: number): Promise<Batch> {
    const response = await this.endpoint.update(id, { availableQuantity: quantity });

    return BatchAssembler.toEntity(response);
  }
}
