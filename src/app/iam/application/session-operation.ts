import { UserRole } from '../domain/model/user.entity';

/** Identity captured exclusively by SessionService, with no mutable session objects. */
export interface SessionOperation {
  readonly businessId: string;
  readonly userId: string | null;
  readonly version: number;
  readonly role: UserRole | null;
  assertCurrent(): void;
  assertRole(requiredRole: UserRole): void;
  complete<T>(pending: Promise<T>): Promise<T>;
}

export class StaleSessionOperationError extends Error {
  constructor() {
    super('La sesión ha cambiado. El resultado de la operación ya no es válido.');
    this.name = 'StaleSessionOperationError';
  }
}
