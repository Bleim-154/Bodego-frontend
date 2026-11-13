import { inject, Injectable } from '@angular/core';
import { SessionService } from '../../iam/application/session.service';
import { DashboardReadPort } from '../domain/dashboard-read.port';
import { summarizeDashboard } from './summarize-dashboard';

export function localCalendarDay(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

@Injectable()
export class GetDashboardUseCase {
  private readonly session = inject(SessionService);
  private readonly source = inject(DashboardReadPort);
  async execute() {
    if (!this.session.hasAuthenticatedSession()) throw new Error('Debe iniciar sesión.');
    const operation = this.session.captureOperation();
    if (operation.role !== 'ADMIN' && operation.role !== 'EMPLOYEE')
      throw new Error('No tiene permisos.');
    const includeAlerts = operation.role === 'ADMIN';
    const data = await operation.complete(this.source.read(includeAlerts));
    operation.assertCurrent();
    if (includeAlerts && data.alerts === null)
      throw new Error('No se pudieron cargar las alertas.');
    const now = new Date();
    const today = localCalendarDay(now);
    const end = localCalendarDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
    return {
      businessId: operation.businessId,
      sessionVersion: operation.version,
      summary: summarizeDashboard(
        { ...data, alerts: includeAlerts ? data.alerts : null },
        today,
        end,
      ),
    };
  }
}
