import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { User } from '../../domain/model/user.entity';
import {
  UserDirectoryPort,
  EmployeeCreationPort,
  NewEmployee,
  UserDirectoryPage,
} from '../../domain/user-directory.port';
import { backendIdentifier } from '../../../shared/infrastructure/backend-identifier';
import { IamManagementGateway } from './iam-management.gateway';

export function managedUser(value: unknown, businessId: string, expectedId?: string): User {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta de usuario no válida.');
  const row = value as Record<string, unknown>;
  if (typeof row['id'] !== 'number' || typeof row['businessId'] !== 'number')
    throw new Error('Identificador del servidor no válido.');
  const id = String(backendIdentifier(row['id']));
  if (
    String(backendIdentifier(row['businessId'])) !== businessId ||
    (expectedId && id !== expectedId)
  )
    throw new Error('Usuario no encontrado.');
  if (
    typeof row['fullName'] !== 'string' ||
    !row['fullName'].trim() ||
    row['fullName'].length > 150 ||
    typeof row['email'] !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row['email']) ||
    row['email'].length > 254 ||
    row['email'] !== row['email'].trim().toLowerCase() ||
    !['ADMIN', 'EMPLOYEE'].includes(row['role'] as string) ||
    typeof row['active'] !== 'boolean'
  )
    throw new Error('Respuesta de usuario no válida.');
  return {
    id,
    businessId,
    fullName: row['fullName'],
    email: row['email'],
    role: row['role'] as User['role'],
    active: row['active'],
  };
}
@Injectable()
export class SpringUserDirectoryRepository implements UserDirectoryPort, EmployeeCreationPort {
  private readonly gateway = inject(IamManagementGateway);
  async getPage(page: number, size: number): Promise<UserDirectoryPage> {
    const op = this.gateway.capture();
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      page > 2147483647 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100
    )
      throw new Error('Paginación no válida.');
    const response = await this.gateway.request(
      op,
      'GET',
      '/iam/users',
      undefined,
      new HttpParams().set('page', page).set('size', size),
    );
    op.assertCurrent();
    if (!response || typeof response !== 'object') throw new Error('Página de usuarios no válida.');
    const dto = response as Record<string, unknown>;
    if (
      !Array.isArray(dto['items']) ||
      dto['items'].length > size ||
      dto['page'] !== page ||
      dto['size'] !== size ||
      typeof dto['hasNext'] !== 'boolean' ||
      (dto['hasNext'] && dto['items'].length !== size)
    )
      throw new Error('Página de usuarios no válida.');
    const items = dto['items'].map((row) => managedUser(row, op.businessId));
    if (items.some((item, index) => index > 0 && Number(item.id) <= Number(items[index - 1].id)))
      throw new Error('Orden de usuarios no válido.');
    return { items, page, size, hasNext: dto['hasNext'] };
  }
  async getById(id: string) {
    const op = this.gateway.capture();
    const key = String(backendIdentifier(id));
    const response = await this.gateway.request(op, 'GET', `/iam/users/${key}`);
    op.assertCurrent();
    return managedUser(response, op.businessId, key);
  }
  async changeStatus(id: string, active: boolean) {
    const op = this.gateway.capture();
    if (typeof active !== 'boolean') throw new Error('Estado no válido.');
    const key = String(backendIdentifier(id));
    const current = await this.getById(key);
    op.assertRole('ADMIN');
    if (current.role !== 'EMPLOYEE')
      throw new Error('Solo se puede modificar el estado de empleados.');
    const response = await this.gateway.request(op, 'PATCH', `/iam/users/${key}/status`, {
      active,
    });
    op.assertCurrent();
    return managedUser(response, op.businessId, key);
  }
  async createEmployee(input: NewEmployee) {
    const op = this.gateway.capture();
    if (
      !input ||
      typeof input !== 'object' ||
      Object.keys(input).some((key) => !['fullName', 'email', 'password'].includes(key))
    )
      throw new Error('Solo se admiten nombre, correo y contraseña para crear EMPLOYEE.');
    if (
      typeof input.fullName !== 'string' ||
      !input.fullName.trim() ||
      input.fullName.length > 150 ||
      typeof input.email !== 'string' ||
      input.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
      typeof input.password !== 'string' ||
      !input.password.trim() ||
      input.password.length < 8 ||
      input.password.length > 72 ||
      new TextEncoder().encode(input.password).length > 72
    )
      throw new Error(
        'Revise nombre, correo y contraseña (mínimo 8 caracteres y máximo 72 bytes UTF-8).',
      );
    const response = await this.gateway.request(op, 'POST', '/iam/users', {
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    op.assertCurrent();
    const user = managedUser(response, op.businessId);
    if (user.role !== 'EMPLOYEE' || !user.active)
      throw new Error(
        'Respuesta de creación no válida. Consulte el directorio antes de reintentar.',
      );
    return user;
  }
}
