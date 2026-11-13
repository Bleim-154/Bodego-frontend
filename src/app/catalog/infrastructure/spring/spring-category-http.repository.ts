import { inject, Injectable } from '@angular/core';
import { Category } from '../../domain/model/category.entity';
import { CategoryRepository, NewCategory } from '../../domain/category.repository';
import { CatalogBackendGateway } from './catalog-backend.gateway';
import { catalogId, catalogText, categoryFromBackend } from './catalog-backend.contract';

@Injectable()
export class SpringCategoryHttpRepository extends CategoryRepository {
  private readonly gateway = inject(CatalogBackendGateway);

  override async getAll(): Promise<Category[]> {
    const operation = this.gateway.capture();
    const response = await this.gateway.request(operation, 'GET', '/categories');
    operation.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de catálogo no válida.');
    return response.map((row) => categoryFromBackend(row, operation.businessId));
  }

  override async getById(id: string): Promise<Category> {
    const operation = this.gateway.capture();
    const key = String(catalogId(id));
    const response = await this.gateway.request(operation, 'GET', `/categories/${key}`);
    operation.assertCurrent();
    return categoryFromBackend(response, operation.businessId, key);
  }

  override async create(category: NewCategory): Promise<Category> {
    const operation = this.gateway.capture(true);
    catalogText(category.name, category.description);
    const response = await this.gateway.request(operation, 'POST', '/categories', {
      businessId: catalogId(operation.businessId),
      name: category.name,
      description: category.description,
    });
    operation.assertCurrent();
    return categoryFromBackend(response, operation.businessId);
  }

  override async update(id: string, category: NewCategory): Promise<Category> {
    const operation = this.gateway.capture(true);
    const key = String(catalogId(id));
    catalogText(category.name, category.description);
    const response = await this.gateway.request(operation, 'PUT', `/categories/${key}`, {
      name: category.name,
      description: category.description,
    });
    operation.assertCurrent();
    return categoryFromBackend(response, operation.businessId, key);
  }
}
