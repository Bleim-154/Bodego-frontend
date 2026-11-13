export interface ProductResponse {
  id: string | number;
  businessId: string | number;
  categoryId: string | number;
  name: string;
  description: string | null;
  price: number;
  minimumStock: number;
  active: boolean;
}
