import { Injectable, inject } from '@angular/core';

import { Product } from '../domain/model/product.entity';
import { NewProduct, ProductChanges, ProductRepository } from '../domain/product.repository';
import { ProductsApiEndpoint } from './products-api-endpoint';
import { ProductAssembler } from './assemblers/product.assembler';

@Injectable()
export class ProductHttpRepository extends ProductRepository {
  private readonly endpoint = inject(ProductsApiEndpoint);

  override async getAll(): Promise<Product[]> {
    const responses = await this.endpoint.getAll();

    return responses.map((response) => ProductAssembler.toEntity(response));
  }

  override async getById(id: string): Promise<Product> {
    const response = await this.endpoint.getById(id);

    return ProductAssembler.toEntity(response);
  }

  override async create(product: NewProduct): Promise<Product> {
    const response = await this.endpoint.create(product);

    return ProductAssembler.toEntity(response);
  }

  override async update(id: string, changes: ProductChanges): Promise<Product> {
    const response = await this.endpoint.update(id, changes);

    return ProductAssembler.toEntity(response);
  }

  override async changeStatus(id: string, active: boolean): Promise<Product> {
    const response = await this.endpoint.update(id, { active });

    return ProductAssembler.toEntity(response);
  }
}
