import { Injectable } from '@angular/core';

import { Category } from '../domain/model/category.entity';
import { CategoryRepository } from '../domain/category.repository';

@Injectable({
  providedIn: 'root',
})
export class GetCategoryByIdUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  execute(id: string): Promise<Category> {
    if (!id.trim()) {
      throw new Error('El identificador de la categoría es obligatorio.');
    }

    return this.categoryRepository.getById(id);
  }
}
