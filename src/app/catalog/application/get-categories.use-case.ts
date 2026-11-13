import { Injectable } from '@angular/core';

import { Category } from '../domain/model/category.entity';
import { CategoryRepository } from '../domain/category.repository';

@Injectable({
  providedIn: 'root',
})
export class GetCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  execute(): Promise<Category[]> {
    return this.categoryRepository.getAll();
  }
}
