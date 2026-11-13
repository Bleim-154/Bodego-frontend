export type RecommendationType = 'RESTOCK' | 'OVERSTOCK' | 'EXPIRING';

export interface Recommendation {
  id: string;
  productId: string;
  batchId: string | null;
  type: RecommendationType;
  message: string;
  createdAt: string;
  dismissed: boolean;
}
