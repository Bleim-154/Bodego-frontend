import { Batch } from '../../domain/model/batch.entity';
import { InventoryMovement } from '../../domain/model/inventory-movement.entity';
import { backendIdentifier as catalogId } from '../../../shared/infrastructure/backend-identifier';

export function inventoryQuantity(value: unknown, positive = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 2_147_483_647
  ) {
    throw new Error('La cantidad debe ser un entero válido.');
  }
  return value;
}

export function inventoryDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Fecha de vencimiento no válida.');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Fecha de vencimiento no válida.');
  return value;
}

export function inventoryCode(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100)
    throw new Error('Ingrese un código de lote de hasta 100 caracteres.');
  return value.trim();
}

function owned(value: unknown, businessId: string, expectedId?: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta de inventario no válida.');
  const row = value as Record<string, unknown>;
  if (typeof row['id'] !== 'number' || typeof row['businessId'] !== 'number')
    throw new Error('Respuesta de inventario no válida.');
  catalogId(row['id']);
  if (
    String(catalogId(row['businessId'])) !== businessId ||
    (expectedId && String(row['id']) !== expectedId)
  )
    throw new Error('No se encontró el recurso.');
  return row;
}

export function batchFromBackend(value: unknown, businessId: string, expectedId?: string): Batch {
  const row = owned(value, businessId, expectedId);
  if (typeof row['productId'] !== 'number') throw new Error('Respuesta de inventario no válida.');
  return {
    id: String(row['id']),
    productId: String(catalogId(row['productId'])),
    code: inventoryCode(row['batchNumber']),
    availableQuantity: inventoryQuantity(row['quantity']),
    expirationDate: inventoryDate(row['expirationDate']),
    // The backend has no entry-date field. Never invent a business timestamp.
    entryDate: '',
  };
}

export function movementFromBackend(value: unknown, businessId: string): InventoryMovement {
  const row = owned(value, businessId);
  if (
    typeof row['lotId'] !== 'number' ||
    (row['type'] !== 'ENTRY' && row['type'] !== 'EXIT') ||
    typeof row['reason'] !== 'string' ||
    !row['reason'].trim() ||
    row['reason'].length > 500 ||
    typeof row['createdAt'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row['createdAt']) ||
    !Number.isFinite(Date.parse(row['createdAt']))
  )
    throw new Error('Respuesta de movimiento no válida.');
  return {
    id: String(row['id']),
    batchId: String(catalogId(row['lotId'])),
    type: row['type'] === 'ENTRY' ? 'IN' : 'OUT',
    quantity: inventoryQuantity(row['quantity'], true),
    reason: row['reason'],
    createdAt: row['createdAt'],
  };
}
