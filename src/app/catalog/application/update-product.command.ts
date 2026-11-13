export interface UpdateProductCommand {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  minimumStock: number;
}
