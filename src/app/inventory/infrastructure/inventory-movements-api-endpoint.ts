import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewInventoryMovement } from '../domain/inventory-movement.repository';
import { InventoryMovementResponse } from './responses/inventory-movement.response';
import { INVENTORY_ENDPOINTS } from './inventory-endpoints';

@Injectable({ providedIn: 'root' })
export class InventoryMovementsApiEndpoint extends BaseApiEndpoint<
  InventoryMovementResponse,
  NewInventoryMovement,
  never
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + INVENTORY_ENDPOINTS.movements);
  }
}
