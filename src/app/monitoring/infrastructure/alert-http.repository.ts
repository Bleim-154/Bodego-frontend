import { Injectable, inject } from '@angular/core';

import { InventoryAlert } from '../domain/model/alert.entity';
import { AlertRepository, NewInventoryAlert } from '../domain/alert.repository';
import { AlertsApiEndpoint } from './alerts-api-endpoint';
import { AlertAssembler } from './assemblers/alert.assembler';

@Injectable()
export class AlertHttpRepository extends AlertRepository {
  private readonly endpoint = inject(AlertsApiEndpoint);

  override async getAll(): Promise<InventoryAlert[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => AlertAssembler.toEntity(response));
  }

  override async create(data: NewInventoryAlert): Promise<InventoryAlert> {
    const response = await this.endpoint.create(data);
    return AlertAssembler.toEntity(response);
  }

  override async markResolved(id: string): Promise<InventoryAlert> {
    const response = await this.endpoint.update(id, { resolved: true });
    return AlertAssembler.toEntity(response);
  }
}
