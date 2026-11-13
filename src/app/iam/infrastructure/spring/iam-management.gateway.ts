import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SessionService } from '../../application/session.service';
import { SessionOperation } from '../../application/session-operation';

@Injectable()
export class IamManagementGateway {
  private readonly session = inject(SessionService);
  private readonly http = inject(HttpClient);
  capture() {
    if (!this.session.hasAuthenticatedSession()) throw new Error('Debe iniciar sesión.');
    const op = this.session.captureOperation();
    op.assertRole('ADMIN');
    return op;
  }
  async request(
    op: SessionOperation,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
    params?: HttpParams,
  ): Promise<unknown> {
    op.assertRole('ADMIN');
    try {
      return await op.complete(
        firstValueFrom(
          this.http.request<unknown>(method, environment.backendApiUrl + path, { body, params }),
        ),
      );
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) throw error;
      if (method !== 'GET' && (error.status === 0 || error.status >= 500))
        throw new Error(
          'No se pudo confirmar el resultado. Consulte el directorio antes de reintentar.',
        );
      const messages: Record<number, string> = {
        0: 'No se pudo conectar con IAM.',
        400: 'Revise los datos del empleado.',
        401: 'La sesión finalizó. Inicie sesión nuevamente.',
        403: 'No tiene permisos.',
        404: 'Usuario no encontrado.',
        409: 'La operación no es compatible con el estado actual o los datos proporcionados.',
      };
      throw new Error(messages[error.status] ?? 'No se pudo completar la operación IAM.');
    }
  }
}
