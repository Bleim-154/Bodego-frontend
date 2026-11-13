export interface RecommendationResponse {
  id: string | number;
  productId: string | number;
  batchId: string | number | null;
  type: 'RESTOCK' | 'OVERSTOCK' | 'EXPIRING';
  message: string;
  createdAt: string;
  dismissed: boolean;
}
