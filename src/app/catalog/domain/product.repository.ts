import { Product } from './model/product.entity';

export type NewProduct = Omit<Product, 'id'>;
export type ProductChanges = Pick<
  Product,
  'categoryId' | 'name' | 'description' | 'price' | 'minimumStock'
>;

export abstract class ProductRepository {
  abstract getAll(): Promise<Product[]>;
  abstract getById(id: string): Promise<Product>;
  abstract create(product: NewProduct): Promise<Product>;
  abstract update(id: string, changes: ProductChanges): Promise<Product>;
  abstract changeStatus(id: string, active: boolean): Promise<Product>;
}
