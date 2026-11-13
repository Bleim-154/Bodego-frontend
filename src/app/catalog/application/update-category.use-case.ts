import { Injectable } from '@angular/core';

import { Category } from '../domain/model/category.entity';
import { CategoryRepository } from '../domain/category.repository';
import { CategoryValidator } from '../domain/category.validator';

import { UpdateCategoryCommand } from './update-category.command';

@Injectable({
  providedIn: 'root',
})
export class UpdateCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  execute(command: UpdateCategoryCommand): Promise<Category> {
    if (!command.id.trim()) {
      throw new Error('El identificador de la categoría es obligatorio.');
    }

    CategoryValidator.validate(command);

    return this.categoryRepository.update(command.id, {
      name: command.name.trim(),
      description: command.description?.trim() || null,
    });
  }
}
