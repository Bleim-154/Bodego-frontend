import { Injectable } from '@angular/core';

import { Product } from '../domain/model/product.entity';
import { ProductRepository } from '../domain/product.repository';
import { ProductValidator } from '../domain/product.validator';

import { CreateProductCommand } from './create-product.command';
import { BusinessContextService } from '../../iam/application/business-context.service';

@Injectable({
  providedIn: 'root',
})
export class CreateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly businessContext: BusinessContextService
  ) {}

  execute(command: CreateProductCommand): Promise<Product> {
    const operation = this.businessContext.captureOperation();
    ProductValidator.validate(command);
    const businessId = operation.businessId;

    operation.assertCurrent();
    return operation.complete(this.productRepository.create({
      ...command,
      businessId,
      name: command.name.trim(),
      description: command.description?.trim() || null,
    }));
  }
}
