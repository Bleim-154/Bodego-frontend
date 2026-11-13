export function fixtures(runId) {
  const product = { categoryId: 0, name: 'Synthetic product', description: null, price: 4, minimumStock: 0, active: true };
  const batch = { code: 'SYNTHETIC', availableQuantity: 10, entryDate: '2026-11-01', expirationDate: null };
  const count = { systemQuantity: 10, countedQuantity: 8, difference: -2, observation: null, countedAt: '2026-11-01' };
  const request = { reason: 'Synthetic correction', status: 'PENDING', requestedAt: '2026-11-01', reviewedAt: null, reviewComment: null };
  return {
    'integration-runs': [{ id: runId }],
    businesses: [{ id: 0, name: 'A', address: 'A', phone: '0', active: true }, { id: 'B', name: 'B', address: 'B', phone: '1', active: true }],
    users: [
      { id: 'admin', businessId: 0, fullName: 'Admin A', email: 'admin@example.test', role: 'ADMIN', active: true },
      { id: 'employee', businessId: 0, fullName: 'Employee A', email: 'employee@example.test', role: 'EMPLOYEE', active: true },
      { id: 'admin-B', businessId: 'B', fullName: 'Admin B', email: 'b@example.test', role: 'ADMIN', active: true },
    ],
    categories: [{ id: 0, name: 'Zero category', description: null, active: true }, { id: 'text', name: 'Text category', description: null, active: true }],
    products: [{ ...product, id: 0, businessId: 0 }, { ...product, id: 7, businessId: 0 }, { ...product, id: 'text/product', businessId: 0 }, { ...product, id: 'p-B', businessId: 'B' }],
    batches: [{ ...batch, id: 10, productId: 7 }, { ...batch, id: 'flow', productId: 0 }, { ...batch, id: 'b-B', productId: 'p-B' }],
    'physical-counts': [{ ...count, id: 20, batchId: 10 }, { ...count, id: 'c-B', batchId: 'b-B' }],
    'correction-requests': [{ ...request, id: 30, physicalCountId: 20 }, { ...request, id: 'r-B', physicalCountId: 'c-B' }, { ...request, id: 'orphan', physicalCountId: 'missing' }],
    'inventory-movements': [{ id: 'initial', batchId: 10, type: 'IN', quantity: 10, reason: 'Initial', createdAt: '2026-11-01' }],
    'stock-adjustments': [{ id: 'old', physicalCountId: 'old-count', batchId: 10, previousQuantity: 11, newQuantity: 10, difference: -1, reason: 'Historical', adjustedAt: '2026-10-01' }],
    'audit-logs': [{ id: 'initial', businessId: 0, userId: 'admin', action: 'INVENTORY_MOVEMENT', entityType: 'Batch', entityId: 10, description: 'Initial', performedAt: '2026-11-01' }],
    wastes: [], alerts: [], recommendations: [], offers: [],
  };
}
