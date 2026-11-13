import { backendIdentifier as identifier } from '../../../shared/infrastructure/backend-identifier';
import { inventoryQuantity } from '../../../inventory/infrastructure/spring/inventory-backend.contract';
import { PhysicalCount } from '../../domain/model/physical-count.entity';
import { StockAdjustment } from '../../domain/model/stock-adjustment.entity';
import { Waste, WasteReason } from '../../domain/model/waste.entity';
import {
  CorrectionRequest,
  CorrectionRequestStatus,
} from '../../domain/model/correction-request.entity';

export function text(value: unknown, max: number, required = true): string | null {
  if (value === null && !required) return null;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error('Texto inválido o demasiado largo.');
  return value.trim() || null;
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
function id(value: unknown): string {
  if (typeof value !== 'number') throw new Error('Identificador del servidor no válido.');
  return String(identifier(value));
}
function owned(value: unknown, business: string, expectedId?: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta de control de stock no válida.');
  const row = value as Record<string, unknown>;
  if (id(row['businessId']) !== business || (expectedId && id(row['id']) !== expectedId))
    throw new Error('No se encontró el recurso.');
  id(row['id']);
  return row;
}
function difference(value: unknown, previous: number, next: number): number {
  if (value !== next - previous) throw new Error('Diferencia de stock no válida.');
  return value as number;
}
export function countFromBackend(value: unknown, business: string): PhysicalCount {
  const row = owned(value, business);
  const systemQuantity = inventoryQuantity(row['systemQuantity']);
  const countedQuantity = inventoryQuantity(row['countedQuantity']);
  return {
    id: id(row['id']),
    batchId: id(row['lotId']),
    systemQuantity,
    countedQuantity,
    difference: difference(row['difference'], systemQuantity, countedQuantity),
    observation: text(row['observation'], 500, false),
    countedAt: instant(row['countedAt']),
  };
}
export function adjustmentFromBackend(value: unknown, business: string): StockAdjustment {
  const row = owned(value, business);
  const previousQuantity = inventoryQuantity(row['previousQuantity']);
  const newQuantity = inventoryQuantity(row['newQuantity']);
  return {
    id: id(row['id']),
    physicalCountId: id(row['physicalCountId']),
    batchId: id(row['lotId']),
    previousQuantity,
    newQuantity,
    difference: difference(row['difference'], previousQuantity, newQuantity),
    reason: text(row['reason'], 500)!,
    adjustedAt: instant(row['adjustedAt']),
  };
}
export function wasteReason(value: unknown): WasteReason {
  if (!['EXPIRED', 'DAMAGED', 'DETERIORATED', 'OTHER'].includes(value as string))
    throw new Error('Motivo de merma inválido.');
  return value as WasteReason;
}
export function wasteFromBackend(value: unknown, business: string): Waste {
  const row = owned(value, business);
  return {
    id: id(row['id']),
    batchId: id(row['lotId']),
    quantity: inventoryQuantity(row['quantity'], true),
    reason: wasteReason(row['reason']),
    observation: text(row['observation'], 500, false),
    registeredAt: instant(row['registeredAt']),
  };
}
export function correctionFromBackend(
  value: unknown,
  business: string,
  expectedId?: string,
): CorrectionRequest {
  const row = owned(value, business, expectedId);
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(row['status'] as string))
    throw new Error('Estado de solicitud inválido.');
  const status = row['status'] as CorrectionRequestStatus;
  if ((status === 'PENDING') !== (row['reviewedAt'] === null))
    throw new Error('Estado de revisión inválido.');
  return {
    id: id(row['id']),
    physicalCountId: id(row['physicalCountId']),
    reason: text(row['reason'], 500)!,
    status,
    requestedAt: instant(row['requestedAt']),
    reviewedAt: row['reviewedAt'] === null ? null : instant(row['reviewedAt']),
    reviewComment: text(row['reviewComment'], 500, false),
  };
}
