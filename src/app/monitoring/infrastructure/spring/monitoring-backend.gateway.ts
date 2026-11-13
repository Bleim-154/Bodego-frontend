import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SessionService } from '../../../iam/application/session.service';
import { SessionOperation } from '../../../iam/application/session-operation';

@Injectable()
export class MonitoringBackendGateway {
  private readonly session = inject(SessionService);
  private readonly http = inject(HttpClient);
  capture(admin = false): SessionOperation {
    if (!this.session.hasAuthenticatedSession()) throw new Error('Debe iniciar sesión.');
    const operation = this.session.captureOperation();
    if (admin) operation.assertRole('ADMIN');
    else if (operation.role !== 'ADMIN' && operation.role !== 'EMPLOYEE')
      throw new Error('No tiene permisos.');
    return operation;
  }
  async request(
    operation: SessionOperation,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    operation.assertCurrent();
    try {
      return await operation.complete(
        firstValueFrom(
          this.http.request<unknown>(method, environment.backendApiUrl + path, { body }),
        ),
      );
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) throw error;
      if (method !== 'GET' && (error.status === 0 || error.status >= 500))
        throw new Error(
          'No se pudo confirmar el resultado. Consulte las alertas antes de reintentar.',
        );
      const messages: Record<number, string> = {
        0: 'No se pudo conectar con Monitoring.',
        400: 'Los datos o las referencias no son válidos.',
        401: 'La sesión finalizó. Inicie sesión nuevamente.',
        403: 'No tiene permisos para esta operación.',
        404: 'No se encontró el recurso.',
        409: 'La operación entra en conflicto con el estado actual. Actualice los datos.',
      };
      throw new Error(messages[error.status] ?? 'No se pudo completar la operación de Monitoring.');
    }
  }
}
