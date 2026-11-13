import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SessionService } from '../../../iam/application/session.service';
import { SessionOperation } from '../../../iam/application/session-operation';

@Injectable()
export class StrategicOffersBackendGateway {
  private readonly session = inject(SessionService);
  private readonly http = inject(HttpClient);
  capture(): SessionOperation {
    if (!this.session.hasAuthenticatedSession()) throw new Error('Debe iniciar sesión.');
    const operation = this.session.captureOperation();
    operation.assertRole('ADMIN');
    return operation;
  }
  async request(
    op: SessionOperation,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    op.assertRole('ADMIN');
    try {
      return await op.complete(
        firstValueFrom(
          this.http.request<unknown>(method, environment.backendApiUrl + path, { body }),
        ),
      );
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) throw error;
      if (method !== 'GET' && (error.status === 0 || error.status >= 500))
        throw new Error(
          'No se pudo confirmar el resultado. Consulte las recomendaciones u ofertas antes de reintentar.',
        );
      const messages: Record<number, string> = {
        0: 'No se pudo conectar con Ofertas Estratégicas.',
        400: 'Revise los datos y las referencias.',
        401: 'La sesión finalizó. Inicie sesión nuevamente.',
        403: 'No tiene permisos para esta operación.',
        404: 'No se encontró el recurso.',
        409: 'La operación entra en conflicto con el estado actual.',
      };
      throw new Error(
        messages[error.status] ?? 'No se pudo completar la operación de Ofertas Estratégicas.',
      );
    }
  }
}
