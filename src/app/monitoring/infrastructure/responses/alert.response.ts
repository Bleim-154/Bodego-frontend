export interface AlertResponse {
  id: string | number;
  productId: string | number;
  batchId: string | number | null;
  type: 'LOW_STOCK' | 'EXPIRING' | 'EXPIRED';
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  createdAt: string;
  resolved: boolean;
}
