import { Injectable, inject } from '@angular/core';

import { InventoryMovement } from '../domain/model/inventory-movement.entity';

import {
  InventoryMovementRepository,
  NewInventoryMovement,
} from '../domain/inventory-movement.repository';

import { InventoryMovementsApiEndpoint } from './inventory-movements-api-endpoint';
import { InventoryMovementAssembler } from './assemblers/inventory-movement.assembler';

@Injectable()
export class InventoryMovementHttpRepository extends InventoryMovementRepository {
  private readonly endpoint = inject(InventoryMovementsApiEndpoint);

  override async getAll(): Promise<InventoryMovement[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => InventoryMovementAssembler.toEntity(response));
  }

  override async create(movement: NewInventoryMovement): Promise<InventoryMovement> {
    const response = await this.endpoint.create(movement);
    return InventoryMovementAssembler.toEntity(response);
  }
}
