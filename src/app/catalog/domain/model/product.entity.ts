export interface Product {
  id: string;
  businessId: string | number;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  minimumStock: number;
  active: boolean;
}
