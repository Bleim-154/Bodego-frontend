import { inject, Injectable } from '@angular/core';
import { Product } from '../../domain/model/product.entity';
import { ProductRepository, NewProduct, ProductChanges } from '../../domain/product.repository';
import { CatalogBackendGateway } from './catalog-backend.gateway';
import {
  catalogId,
  catalogNumbers,
  catalogText,
  productFromBackend,
} from './catalog-backend.contract';

@Injectable()
export class SpringProductHttpRepository extends ProductRepository {
  private readonly gateway = inject(CatalogBackendGateway);

  override async getAll(): Promise<Product[]> {
    const operation = this.gateway.capture();
    const response = await this.gateway.request(operation, 'GET', '/products');
    operation.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de catálogo no válida.');
    return response.map((row) => productFromBackend(row, operation.businessId));
  }

  override async getById(id: string): Promise<Product> {
    const operation = this.gateway.capture();
    const key = String(catalogId(id));
    const response = await this.gateway.request(operation, 'GET', `/products/${key}`);
    operation.assertCurrent();
    return productFromBackend(response, operation.businessId, key);
  }

  override async create(product: NewProduct): Promise<Product> {
    const operation = this.gateway.capture(true);
    if (String(product.businessId) !== operation.businessId)
      throw new Error('No tiene permisos para esta operación.');
    if (product.active !== true)
      throw new Error('Los productos nuevos se registran activos; desactívelos desde el listado.');
    const body = { businessId: catalogId(operation.businessId), ...this.information(product) };
    const response = await this.gateway.request(operation, 'POST', '/products', body);
    operation.assertCurrent();
    return productFromBackend(response, operation.businessId);
  }

  override async update(id: string, changes: ProductChanges): Promise<Product> {
    const operation = this.gateway.capture(true);
    const key = String(catalogId(id));
    const response = await this.gateway.request(
      operation,
      'PUT',
      `/products/${key}`,
      this.information(changes),
    );
    operation.assertCurrent();
    return productFromBackend(response, operation.businessId, key);
  }

  override async changeStatus(id: string, active: boolean): Promise<Product> {
    const operation = this.gateway.capture(true);
    const key = String(catalogId(id));
    if (typeof active !== 'boolean') throw new Error('Estado de producto no válido.');
    const response = await this.gateway.request(
      operation,
      'PATCH',
      `/products/${key}/${active ? 'activate' : 'deactivate'}`,
    );
    operation.assertCurrent();
    return productFromBackend(response, operation.businessId, key);
  }

  private information(product: ProductChanges): object {
    catalogText(product.name, product.description);
    catalogNumbers(product.price, product.minimumStock);
    return {
      categoryId: catalogId(product.categoryId),
      name: product.name,
      description: product.description,
      price: product.price,
      minimumStock: product.minimumStock,
    };
  }
}
