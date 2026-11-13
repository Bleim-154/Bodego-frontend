import { Injectable, inject } from '@angular/core';

import { Category } from '../domain/model/category.entity';
import { CategoryRepository, NewCategory } from '../domain/category.repository';
import { CategoriesApiEndpoint } from './categories-api-endpoint';
import { CategoryAssembler } from './assemblers/category.assembler';

@Injectable()
export class CategoryHttpRepository extends CategoryRepository {
  private readonly endpoint = inject(CategoriesApiEndpoint);

  override async getAll(): Promise<Category[]> {
    const responses = await this.endpoint.getAll();

    return responses.map((response) => CategoryAssembler.toEntity(response));
  }

  override async getById(id: string): Promise<Category> {
    const response = await this.endpoint.getById(id);

    return CategoryAssembler.toEntity(response);
  }

  override async create(category: NewCategory): Promise<Category> {
    const response = await this.endpoint.create(category);

    return CategoryAssembler.toEntity(response);
  }

  override async update(id: string, category: NewCategory): Promise<Category> {
    const response = await this.endpoint.update(id, category);

    return CategoryAssembler.toEntity(response);
  }
}
