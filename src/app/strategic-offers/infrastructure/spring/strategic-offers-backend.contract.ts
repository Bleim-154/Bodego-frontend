import { backendIdentifier } from '../../../shared/infrastructure/backend-identifier';
import { Offer } from '../../domain/model/offer.entity';
import { Recommendation } from '../../domain/model/recommendation.entity';

function id(value: unknown): string {
  if (typeof value !== 'number') throw new Error('Identificador del servidor no válido.');
  return String(backendIdentifier(value));
}
function owned(value: unknown, business: string, expectedId?: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta no válida.');
  const row = value as Record<string, unknown>;
  if (id(row['businessId']) !== business || (expectedId && id(row['id']) !== expectedId))
    throw new Error('No se encontró el recurso.');
  id(row['id']);
  return row;
}
export function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255)
    throw new Error('Ingrese un texto de hasta 255 caracteres.');
  return value.trim();
}
export function discount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value >= 100)
    throw new Error('El descuento debe ser mayor que 0 y menor que 100.');
  return value;
}
export function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Fecha no válida.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error('Fecha no válida.');
  return value;
}
export function offerInformation(value: {
  title: unknown;
  discountPercentage: unknown;
  startDate: unknown;
  endDate: unknown;
}) {
  const result = {
    title: title(value.title),
    discountPercentage: discount(value.discountPercentage),
    startDate: date(value.startDate),
    endDate: date(value.endDate),
  };
  if (result.endDate < result.startDate)
    throw new Error('La fecha de fin no puede preceder al inicio.');
  return result;
}
export function offerFromBackend(value: unknown, business: string, expectedId?: string): Offer {
  const row = owned(value, business, expectedId);
  if (typeof row['active'] !== 'boolean') throw new Error('Estado de oferta no válido.');
  return {
    id: id(row['id']),
    productId: id(row['productId']),
    ...offerInformation({
      title: row['title'],
      discountPercentage: row['discountPercentage'],
      startDate: row['startDate'],
      endDate: row['endDate'],
    }),
    active: row['active'],
  };
}
export function recommendationFromBackend(
  value: unknown,
  business: string,
  expectedId?: string,
): Recommendation {
  const row = owned(value, business, expectedId);
  if (
    !['RESTOCK', 'OVERSTOCK', 'EXPIRING'].includes(row['type'] as string) ||
    typeof row['dismissed'] !== 'boolean' ||
    typeof row['generatedAt'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row['generatedAt']) ||
    !Number.isFinite(Date.parse(row['generatedAt']))
  )
    throw new Error('Recomendación no válida.');
  return {
    id: id(row['id']),
    productId: id(row['productId']),
    batchId: row['lotId'] === null ? null : id(row['lotId']),
    type: row['type'] as Recommendation['type'],
    message: title(row['message']),
    createdAt: row['generatedAt'],
    dismissed: row['dismissed'],
  };
}
