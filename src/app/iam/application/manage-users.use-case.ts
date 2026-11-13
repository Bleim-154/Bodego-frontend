import { Injectable, inject } from '@angular/core';

import { SessionService } from './session.service';

import { UserRepository, NewUser, UserChanges } from '../domain/user.repository';

import { BusinessRepository } from '../domain/business.repository';

@Injectable({ providedIn: 'root' })
export class ManageUsersUseCase {
  private readonly session = inject(SessionService);

  constructor(
    private readonly repository: UserRepository,
    private readonly businesses: BusinessRepository,
  ) {}

  getAll() {
    return this.repository.getAll();
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  private async validate(data: UserChanges, currentId?: string): Promise<void> {
    if (!data.fullName.trim()) {
      throw new Error('El nombre es obligatorio.');
    }

    const email = data.email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Ingrese un correo electrónico válido.');
    }

    if (data.role !== 'ADMIN' && data.role !== 'EMPLOYEE') {
      throw new Error('Rol inválido.');
    }

    if (!data.businessId) {
      throw new Error('Seleccione un negocio.');
    }

    const business = await this.businesses.getById(data.businessId);

    if (!business.active) {
      throw new Error('No se pueden asignar usuarios a negocios inactivos.');
    }

    const users = await this.repository.getAll();

    const duplicate = users.some(
      (user) =>
        user.email.trim().toLowerCase() === email && String(user.id) !== String(currentId ?? ''),
    );

    if (duplicate) {
      throw new Error('Ya existe un usuario con ese correo.');
    }
  }

  async create(data: NewUser) {
    await this.validate(data);

    return this.repository.create({
      ...data,
      fullName: data.fullName.trim(),
      email: data.email.trim().toLowerCase(),
    });
  }

  async update(id: string, changes: UserChanges) {
    const updatedSession = this.session.trackUserUpdate(id);
    await this.repository.getById(id);
    await this.validate(changes, id);

    const updated = await this.repository.update(id, {
      ...changes,
      fullName: changes.fullName.trim(),
      email: changes.email.trim().toLowerCase(),
    });
    updatedSession(updated);
    return updated;
  }

  async changeStatus(id: string, active: boolean) {
    const updatedSession = this.session.trackUserUpdate(id);
    const user = await this.repository.getById(id);

    if (active) {
      const business = await this.businesses.getById(user.businessId);

      if (!business.active) {
        throw new Error('No se puede activar un usuario de un negocio inactivo.');
      }
    }

    const updated = await this.repository.changeStatus(id, active);
    updatedSession(updated);
    return updated;
  }
}
