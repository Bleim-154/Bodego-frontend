import { Injectable, OnDestroy, computed, signal } from '@angular/core';

import { SessionOperation, StaleSessionOperationError } from './session-operation';
import { User, UserRole } from '../domain/model/user.entity';
import { Business } from '../domain/model/business.entity';

@Injectable({ providedIn: 'root' })
export class SessionService implements OnDestroy {
  private sessionVersion = 0;
  private authentication: Readonly<{ accessToken: string; expiresAt: number }> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly userState = signal<Readonly<User> | null>(null);
  private readonly businessState = signal<Readonly<Business> | null>(null);

  readonly currentUser = this.userState.asReadonly();
  readonly currentBusiness = this.businessState.asReadonly();

  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');

  readonly isEmployee = computed(() => this.currentUser()?.role === 'EMPLOYEE');

  get version(): number {
    return this.sessionVersion;
  }

  hasAuthenticatedSession(): boolean {
    return this.getAccessToken() !== null && this.isLoggedIn();
  }

  getAccessToken(): string | null {
    if (this.authentication !== null && this.authentication.expiresAt <= Date.now())
      this.endSession();
    return this.authentication?.accessToken ?? null;
  }

  ngOnDestroy(): void {
    this.clearAuthentication();
  }

  private clearAuthentication(): void {
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    this.authentication = null;
  }

  startSession(
    user: User,
    business: Business,
    authentication?: { accessToken: string; expiresAt: number },
  ): void {
    if (!user.active) {
      throw new Error('El usuario está inactivo.');
    }

    if (!business.active) {
      throw new Error('El negocio está inactivo.');
    }

    if (String(user.businessId) !== String(business.id)) {
      throw new Error('El usuario no pertenece al negocio.');
    }

    const userSnapshot = this.snapshot(user);
    const businessSnapshot = this.snapshot(business);
    if (
      authentication &&
      (!authentication.accessToken ||
        !Number.isFinite(authentication.expiresAt) ||
        authentication.expiresAt <= Date.now() ||
        authentication.expiresAt > Date.now() + 900_000)
    ) {
      throw new Error('La sesión de acceso no es válida.');
    }
    this.clearAuthentication();
    this.sessionVersion++;
    this.userState.set(userSnapshot);
    this.businessState.set(businessSnapshot);
    if (authentication) {
      this.authentication = Object.freeze({ ...authentication });
      const version = this.sessionVersion;
      this.expiryTimer = setTimeout(() => {
        if (this.sessionVersion === version) this.endSession();
      }, authentication.expiresAt - Date.now());
    }
  }

  endSession(): void {
    this.clearAuthentication();
    this.sessionVersion++;
    this.userState.set(null);
    this.businessState.set(null);
  }

  /** Detach caller references and freeze the entire plain-data snapshot. */
  private snapshot<T extends object>(value: T): Readonly<T> {
    const copy = structuredClone(value);
    const freeze = (item: object): void => {
      for (const child of Object.values(item)) {
        if (child !== null && typeof child === 'object') freeze(child);
      }
      Object.freeze(item);
    };
    freeze(copy);
    return copy;
  }

  /** Capture before the update starts; a late response cannot end a newer session. */
  trackUserUpdate(id: string): (updated: User) => void {
    const version = this.sessionVersion;
    const user = this.currentUser();
    return (updated) => {
      if (
        this.sessionVersion === version &&
        user !== null &&
        String(user.id) === String(id) &&
        String(updated.id) === String(id) &&
        (user.role !== updated.role ||
          user.active !== updated.active ||
          String(user.businessId) !== String(updated.businessId))
      ) {
        this.endSession();
      }
    };
  }

  trackBusinessUpdate(id: string): (updated: Business) => void {
    const version = this.sessionVersion;
    const business = this.currentBusiness();
    return (updated) => {
      if (
        this.sessionVersion === version &&
        business !== null &&
        String(business.id) === String(id) &&
        String(updated.id) === String(id) &&
        !updated.active
      ) {
        this.endSession();
      }
    };
  }

  /** Capture before the first await. A new start/end invalidates even an A -> B -> A round trip. */
  captureOperation(): SessionOperation {
    const business = this.currentBusiness();
    if (business === null) {
      throw new Error('No existe un negocio activo.');
    }
    const user = this.currentUser();
    const businessId = String(business.id);
    const userId = user === null ? null : String(user.id);
    const role = user?.role ?? null;
    const version = this.sessionVersion;
    const assertCurrent = (): void => {
      const currentUser = this.currentUser();
      const currentBusiness = this.currentBusiness();
      if (
        this.sessionVersion !== version ||
        currentUser !== user ||
        currentBusiness !== business ||
        currentBusiness === null ||
        String(currentBusiness.id) !== businessId ||
        (currentUser === null ? null : String(currentUser.id)) !== userId ||
        (currentUser?.role ?? null) !== role
      ) {
        throw new StaleSessionOperationError();
      }
    };
    return Object.freeze({
      businessId,
      userId,
      version,
      role,
      assertCurrent,
      assertRole: (requiredRole: UserRole): void => {
        assertCurrent();
        if (role !== requiredRole) {
          throw new Error(`La operación requiere el rol ${requiredRole}.`);
        }
      },
      complete: <T>(pending: Promise<T>): Promise<T> =>
        pending.then((value) => {
          assertCurrent();
          return value;
        }),
    });
  }
}
