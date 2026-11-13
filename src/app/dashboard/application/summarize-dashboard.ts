import { DashboardReadData } from '../domain/dashboard-read.port';

function add(total: number, quantity: number): number {
  const sum = total + quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(sum))
    throw new Error('Las cantidades exceden la precisión disponible.');
  return sum;
}
// Instant responses can have micro/nanoseconds and different zone offsets.
function epochNanoseconds(value: string): bigint {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error('Fecha de movimiento no válida.');
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '';
  return BigInt(milliseconds) * 1_000_000n + BigInt(fraction.padEnd(9, '0').slice(3, 9));
}
export function summarizeDashboard(data: DashboardReadData, today: string, end: string) {
  const productIds = new Set(data.products.map((product) => product.id));
  const batchIds = new Set(data.batches.map((batch) => batch.id));
  const stock = new Map<string, number>();
  let totalUnits = 0;
  for (const batch of data.batches) {
    if (!productIds.has(batch.productId))
      throw new Error('No se pudieron relacionar los lotes con el catálogo. Actualice los datos.');
    totalUnits = add(totalUnits, batch.availableQuantity);
    stock.set(batch.productId, add(stock.get(batch.productId) ?? 0, batch.availableQuantity));
  }
  for (const movement of data.movements) {
    if (!batchIds.has(movement.batchId))
      throw new Error(
        'No se pudieron relacionar los movimientos con los lotes. Actualice los datos.',
      );
  }
  return {
    activeProducts: data.products.filter((product) => product.active).length,
    totalBatches: data.batches.length,
    totalUnits,
    lowStockProducts: data.products.filter(
      (product) => product.active && (stock.get(product.id) ?? 0) < product.minimumStock,
    ).length,
    expiringBatches: data.batches.filter(
      (batch) =>
        batch.availableQuantity > 0 &&
        batch.expirationDate !== null &&
        batch.expirationDate >= today &&
        batch.expirationDate <= end,
    ).length,
    pendingAlerts:
      data.alerts === null ? null : data.alerts.filter((alert) => !alert.resolved).length,
    recentMovements: data.movements
      .map((movement) => ({ movement, at: epochNanoseconds(movement.createdAt) }))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, 5)
      .map((item) => item.movement),
    evaluatedOn: today,
  };
}
