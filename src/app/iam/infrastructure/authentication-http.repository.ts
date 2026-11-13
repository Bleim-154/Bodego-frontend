import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthenticationRepository } from '../domain/authentication.repository';
import { AccessToken, AuthenticatedIdentity } from '../domain/model/authentication';

@Injectable()
export class AuthenticationHttpRepository extends AuthenticationRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.backendApiUrl;

  override async login(email: string, password: string): Promise<AccessToken> {
    const response = await firstValueFrom(
      this.http.post<unknown>(`${this.baseUrl}/auth/login`, { email, password }),
    );
    if (!response || typeof response !== 'object')
      throw new Error('Invalid authentication response');
    const dto = response as Record<string, unknown>;
    if (
      dto['tokenType'] !== 'Bearer' ||
      typeof dto['accessToken'] !== 'string' ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(dto['accessToken']) ||
      dto['accessToken'].length > 8192 ||
      !Number.isInteger(dto['expiresIn']) ||
      (dto['expiresIn'] as number) <= 0 ||
      (dto['expiresIn'] as number) > 900
    ) {
      throw new Error('Invalid authentication response');
    }
    return { accessToken: dto['accessToken'], expiresIn: dto['expiresIn'] as number };
  }

  override async me(accessToken: string): Promise<AuthenticatedIdentity> {
    // The handshake has not committed a session; this Bearer stays on this request.
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    if (!response || typeof response !== 'object') throw new Error('Invalid identity response');
    const dto = response as Record<string, unknown>;
    if (
      !Number.isSafeInteger(dto['userId']) ||
      (dto['userId'] as number) <= 0 ||
      !Number.isSafeInteger(dto['businessId']) ||
      (dto['businessId'] as number) <= 0 ||
      (dto['role'] !== 'ADMIN' && dto['role'] !== 'EMPLOYEE')
    ) {
      throw new Error('Invalid identity response');
    }
    return {
      userId: String(dto['userId']),
      businessId: String(dto['businessId']),
      role: dto['role'],
    };
  }
}
