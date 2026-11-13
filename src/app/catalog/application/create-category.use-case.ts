import { Injectable } from '@angular/core';

import { Category } from '../domain/model/category.entity';
import { CategoryRepository } from '../domain/category.repository';
import { CategoryValidator } from '../domain/category.validator';

import { CreateCategoryCommand } from './create-category.command';

@Injectable({
  providedIn: 'root',
})
export class CreateCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  execute(command: CreateCategoryCommand): Promise<Category> {
    CategoryValidator.validate(command);

    return this.categoryRepository.create({
      name: command.name.trim(),
      description: command.description?.trim() || null,
    });
  }
}
