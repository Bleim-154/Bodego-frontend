import { backendIdentifier } from '../../../shared/infrastructure/backend-identifier';
import { InventoryAlert } from '../../domain/model/alert.entity';
import { AuditLog } from '../../domain/model/audit-log.entity';

function id(value: unknown): string {
  if (typeof value !== 'number') throw new Error('Identificador del servidor no válido.');
  return String(backendIdentifier(value));
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error('Texto del servidor no válido.');
  return value;
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error('Fecha del servidor no válida.');
  return value;
}
function owned(value: unknown, businessId: string, expectedId?: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta de Monitoring no válida.');
  const row = value as Record<string, unknown>;
  if (id(row['businessId']) !== businessId || (expectedId && id(row['id']) !== expectedId))
    throw new Error('No se encontró el recurso.');
  id(row['id']);
  return row;
}
export function alertFromBackend(
  value: unknown,
  businessId: string,
  expectedId?: string,
): InventoryAlert {
  const row = owned(value, businessId, expectedId);
  if (
    !['LOW_STOCK', 'EXPIRING_SOON', 'EXPIRED'].includes(row['type'] as string) ||
    !['LOW', 'MEDIUM', 'HIGH'].includes(row['severity'] as string) ||
    typeof row['resolved'] !== 'boolean'
  )
    throw new Error('Alerta del servidor no válida.');
  const resolvedAt = row['resolvedAt'] === null ? null : instant(row['resolvedAt']);
  if (row['resolved'] !== (resolvedAt !== null)) throw new Error('Estado de resolución no válido.');
  return {
    id: id(row['id']),
    productId: id(row['productId']),
    batchId: row['lotId'] === null ? null : id(row['lotId']),
    type: row['type'] as InventoryAlert['type'],
    severity: row['severity'] as InventoryAlert['severity'],
    message: text(row['message'], 255),
    createdAt: instant(row['generatedAt']),
    resolved: row['resolved'],
    resolvedAt,
  };
}
export function auditFromBackend(value: unknown, businessId: string): AuditLog {
  const row = owned(value, businessId);
  return {
    id: id(row['id']),
    businessId: id(row['businessId']),
    userId: row['userId'] === null ? null : id(row['userId']),
    action: text(row['action'], 100),
    entityType: text(row['entityType'], 100),
    entityId: id(row['entityId']),
    description: text(row['description'], 1000),
    performedAt: instant(row['occurredAt']),
  };
}
