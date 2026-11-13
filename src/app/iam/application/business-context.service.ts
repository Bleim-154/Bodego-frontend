import { Injectable, inject, computed } from '@angular/core';

import { SessionOperation } from './session-operation';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class BusinessContextService {
  private readonly session = inject(SessionService);

  readonly businessId = computed(() => this.session.currentBusiness()?.id ?? null);

  readonly businessName = computed(() => this.session.currentBusiness()?.name ?? '');

  captureOperation(): SessionOperation {
    return this.session.captureOperation();
  }

  requireBusinessId(): string {
    const id = this.businessId();

    if (id === null) {
      throw new Error('No existe un negocio activo.');
    }

    return String(id);
  }

  belongsToBusiness(businessId: string | number): boolean {
    const currentId = this.businessId();

    return currentId !== null && String(currentId) === String(businessId);
  }
}
