import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { AlertRepository } from '../domain/alert.repository';
import { GetAlertsUseCase } from './get-alerts.use-case';

@Injectable({ providedIn: 'root' })
export class ResolveAlertUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: AlertRepository,
    private readonly getAlerts: GetAlertsUseCase,
  ) {}

  async execute(id: string) {
    const operation = this.operationContext.captureOperation();
    const alerts = await this.getAlerts.execute();
    operation.assertCurrent();

    const alert = alerts.find((item) => String(item.id) === String(id));

    if (!alert) {
      throw new Error('La alerta no pertenece al negocio activo.');
    }

    if (alert.resolved) {
      throw new Error('La alerta ya fue atendida.');
    }

    operation.assertCurrent();
    return operation.complete(this.repository.markResolved(String(alert.id)));
  }
}
