export interface Batch {
  id: string;
  productId: string;
  code: string;
  availableQuantity: number;
  entryDate: string;
  expirationDate: string | null;
}
