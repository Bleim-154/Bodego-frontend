import { Category } from '../../domain/model/category.entity';
import { Product } from '../../domain/model/product.entity';

import { backendIdentifier as catalogId } from '../../../shared/infrastructure/backend-identifier';
export { catalogId };

function responseRow(value: unknown, businessId: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta de catálogo no válida.');
  const row = value as Record<string, unknown>;
  if (typeof row['id'] !== 'number' || typeof row['businessId'] !== 'number')
    throw new Error('Respuesta de catálogo no válida.');
  catalogId(row['id']);
  if (String(catalogId(row['businessId'])) !== businessId)
    throw new Error('No se encontró el recurso.');
  catalogText(row['name'], row['description']);
  return row;
}

export function catalogText(name: unknown, description: unknown): void {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 100 ||
    (description !== null && (typeof description !== 'string' || description.length > 255))
  ) {
    throw new Error('Revise el nombre y la descripción del catálogo.');
  }
}

export function catalogNumbers(price: unknown, minimumStock: unknown): void {
  if (
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 99_999_999.99 ||
    Math.round(price * 100) / 100 !== price ||
    typeof minimumStock !== 'number' ||
    !Number.isInteger(minimumStock) ||
    minimumStock < 0 ||
    minimumStock > 2_147_483_647
  ) {
    throw new Error('Revise el precio (máximo dos decimales) y el stock mínimo.');
  }
}

export function categoryFromBackend(
  value: unknown,
  businessId: string,
  expectedId?: string,
): Category {
  const row = responseRow(value, businessId);
  if (expectedId && String(row['id']) !== expectedId) throw new Error('No se encontró el recurso.');
  return {
    id: String(row['id']),
    name: row['name'] as string,
    description: row['description'] as string | null,
  };
}

export function productFromBackend(
  value: unknown,
  businessId: string,
  expectedId?: string,
): Product {
  const row = responseRow(value, businessId);
  if (expectedId && String(row['id']) !== expectedId) throw new Error('No se encontró el recurso.');
  if (typeof row['categoryId'] !== 'number' || typeof row['active'] !== 'boolean')
    throw new Error('Respuesta de catálogo no válida.');
  catalogNumbers(row['price'], row['minimumStock']);
  return {
    id: String(row['id']),
    businessId: String(row['businessId']),
    categoryId: String(catalogId(row['categoryId'])),
    name: row['name'] as string,
    description: row['description'] as string | null,
    price: row['price'] as number,
    minimumStock: row['minimumStock'] as number,
    active: row['active'],
  };
}
