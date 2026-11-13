export interface AuditLogResponse {
  id: string | number;
  // Historical seed records may not have a business association.
  businessId?: string | number;
  action: 'PRODUCT_CREATED' | 'INVENTORY_MOVEMENT' | 'STOCK_ADJUSTED' | 'WASTE_REGISTERED' | 'CORRECTION_REVIEWED';
  entityType: string;
  entityId: string | number;
  description: string;
  performedAt: string;
  userId: string | number | null;
}
