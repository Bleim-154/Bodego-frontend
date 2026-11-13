import { Injectable, inject } from '@angular/core';

import { SessionService } from './session.service';

import { BusinessRepository, NewBusiness, BusinessChanges } from '../domain/business.repository';

@Injectable({ providedIn: 'root' })
export class ManageBusinessesUseCase {
  private readonly session = inject(SessionService);

  constructor(private readonly repository: BusinessRepository) {}

  getAll() {
    return this.repository.getAll();
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  private validate(data: BusinessChanges): void {
    if (!data.name.trim()) {
      throw new Error('El nombre del negocio es obligatorio.');
    }

    if (!data.address.trim()) {
      throw new Error('La dirección es obligatoria.');
    }

    if (!data.phone.trim()) {
      throw new Error('El teléfono es obligatorio.');
    }
  }

  async create(data: NewBusiness) {
    this.validate(data);

    return this.repository.create({
      ...data,
      name: data.name.trim(),
      address: data.address.trim(),
      phone: data.phone.trim(),
    });
  }

  async update(id: string, changes: BusinessChanges) {
    const updatedSession = this.session.trackBusinessUpdate(id);
    this.validate(changes);

    const updated = await this.repository.update(id, {
      name: changes.name.trim(),
      address: changes.address.trim(),
      phone: changes.phone.trim(),
    });
    updatedSession(updated);
    return updated;
  }

  async changeStatus(id: string, active: boolean) {
    const updatedSession = this.session.trackBusinessUpdate(id);
    await this.repository.getById(id);

    const updated = await this.repository.changeStatus(id, active);
    updatedSession(updated);
    return updated;
  }
}
