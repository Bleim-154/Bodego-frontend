export interface CreateProductCommand {
  businessId: string | number;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  minimumStock: number;
  active: boolean;
}
