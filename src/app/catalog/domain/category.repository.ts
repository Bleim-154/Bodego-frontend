import { Category } from './model/category.entity';

export type NewCategory = Omit<Category, 'id'>;

export abstract class CategoryRepository {
  abstract getAll(): Promise<Category[]>;
  abstract getById(id: string): Promise<Category>;
  abstract create(category: NewCategory): Promise<Category>;
  abstract update(id: string, category: NewCategory): Promise<Category>;
}
