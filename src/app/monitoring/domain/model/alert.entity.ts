// Preserve legacy JSON values for pending modules; real adapters retain backend enums.
export type AlertType = 'LOW_STOCK' | 'EXPIRING' | 'EXPIRED' | 'EXPIRING_SOON';
export type AlertSeverity = 'WARNING' | 'CRITICAL' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface InventoryAlert {
  id: string;
  productId: string;
  batchId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt?: string | null;
}
