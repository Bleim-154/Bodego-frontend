export interface BatchResponse {
  id: string | number;
  productId: string | number;
  code: string;
  availableQuantity: number;
  entryDate: string;
  expirationDate: string | null;
}
