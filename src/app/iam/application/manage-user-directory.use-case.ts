import { inject, Injectable } from '@angular/core';
import { SessionService } from './session.service';
import {
  UserDirectoryPort,
  EmployeeCreationPort,
  NewEmployee,
} from '../domain/user-directory.port';

@Injectable()
export class ManageUserDirectoryUseCase {
  private readonly session = inject(SessionService);
  private readonly users = inject(UserDirectoryPort);
  private capture() {
    if (!this.session.hasAuthenticatedSession()) throw new Error('Debe iniciar sesión.');
    const op = this.session.captureOperation();
    op.assertRole('ADMIN');
    return op;
  }
  async getPage(page = 0, size = 20) {
    const op = this.capture();
    const result = await op.complete(this.users.getPage(page, size));
    op.assertCurrent();
    return { ...result, businessId: op.businessId, sessionVersion: op.version };
  }
  async getById(id: string) {
    const op = this.capture();
    return op.complete(this.users.getById(id));
  }
  async changeStatus(id: string, active: boolean) {
    const op = this.capture();
    return op.complete(this.users.changeStatus(id, active));
  }
}
@Injectable()
export class CreateEmployeeUseCase {
  private readonly session = inject(SessionService);
  private readonly creation = inject(EmployeeCreationPort);
  async execute(input: NewEmployee) {
    if (!this.session.hasAuthenticatedSession()) throw new Error('Debe iniciar sesión.');
    const op = this.session.captureOperation();
    op.assertRole('ADMIN');
    return op.complete(this.creation.createEmployee(input));
  }
}
