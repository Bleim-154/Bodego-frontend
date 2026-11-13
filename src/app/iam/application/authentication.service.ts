import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthenticationRepository } from '../domain/authentication.repository';
import { SessionService } from './session.service';

export class AuthenticationError extends Error {}

@Injectable({ providedIn: 'root' })
export class AuthenticationService {
  private readonly repository = inject(AuthenticationRepository);
  private readonly session = inject(SessionService);

  async login(email: string, password: string): Promise<void> {
    this.session.endSession();
    const version = this.session.version;
    const requestedAt = Date.now();
    const assertCurrent = (): void => {
      if (this.session.version !== version)
        throw new AuthenticationError('La solicitud de acceso ya no está vigente.');
    };
    try {
      if (!email.trim() || !password)
        throw new AuthenticationError('Ingrese su correo y contraseña.');
      const token = await this.repository.login(email.trim().toLowerCase(), password);
      assertCurrent();
      const identity = await this.repository.me(token.accessToken);
      assertCurrent();
      // /me exposes no profile. These labels adapt navigation, not mock identities.
      this.session.startSession(
        {
          id: identity.userId,
          businessId: identity.businessId,
          role: identity.role,
          fullName: `Usuario ${identity.userId}`,
          email: '',
          active: true,
        },
        {
          id: identity.businessId,
          name: `Negocio ${identity.businessId}`,
          address: '',
          phone: '',
          active: true,
        },
        { accessToken: token.accessToken, expiresAt: requestedAt + token.expiresIn * 1000 },
      );
    } catch (error) {
      if (this.session.version === version) this.session.endSession();
      if (error instanceof AuthenticationError) throw error;
      if (error instanceof HttpErrorResponse && error.status === 401) {
        throw new AuthenticationError('Credenciales inválidas o cuenta no habilitada.');
      }
      if (error instanceof HttpErrorResponse && error.status === 0) {
        throw new AuthenticationError('No se pudo conectar con el servicio de acceso.');
      }
      throw new AuthenticationError('No se pudo iniciar sesión. Inténtelo nuevamente.');
    }
  }
}
