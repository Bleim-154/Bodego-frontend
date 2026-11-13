import { Injectable } from '@angular/core';

import { Product } from '../domain/model/product.entity';
import { ProductRepository } from '../domain/product.repository';
import { ProductValidator } from '../domain/product.validator';

import { UpdateProductCommand } from './update-product.command';
import { BusinessContextService } from '../../iam/application/business-context.service';

@Injectable({
  providedIn: 'root',
})
export class UpdateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly businessContext: BusinessContextService,
  ) {}

  async execute(command: UpdateProductCommand): Promise<Product> {
    const operation = this.businessContext.captureOperation();
    if (!command.id.trim()) {
      throw new Error('El identificador del producto es obligatorio.');
    }

    ProductValidator.validate(command);

    const businessId = operation.businessId;

    // Obtener el producto existente
    const product = await this.productRepository.getById(command.id);
    operation.assertCurrent();

    // Verificar que pertenezca al negocio activo
    if (String(product.businessId) !== businessId || this.businessContext.requireBusinessId() !== businessId) {
      throw new Error('No puede modificar productos de otro negocio.');
    }

    const { id, categoryId, name, description, price, minimumStock } = command;

    operation.assertCurrent();
    return operation.complete(this.productRepository.update(id, {
      categoryId,
      name: name.trim(),
      description: description?.trim() || null,
      price,
      minimumStock,
    }));
  }
}
