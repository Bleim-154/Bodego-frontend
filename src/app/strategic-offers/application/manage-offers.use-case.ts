import { Injectable } from '@angular/core';

import { SessionOperation } from '../../iam/application/session-operation';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { OfferRepository, NewOffer, OfferChanges } from '../domain/offer.repository';
import { GetProductsUseCase } from '../../catalog/application/get-products.use-case';
import { BusinessContextService } from '../../iam/application/business-context.service';

@Injectable({ providedIn: 'root' })
export class ManageOffersUseCase {
  constructor(
    private readonly repository: OfferRepository,
    private readonly products: ProductRepository,
    private readonly getProducts: GetProductsUseCase,
    private readonly businessContext: BusinessContextService,
  ) {}

  async getAll() {
    const operation = this.businessContext.captureOperation();
    const [offers, products] = await Promise.all([
      this.repository.getAll(),
      this.getProducts.execute(),
    ]);
    operation.assertCurrent();

    const productIds = new Set(products.map((product) => String(product.id)));

    operation.assertCurrent();
    return offers.filter((offer) => productIds.has(String(offer.productId)));
  }

  async getById(id: string) {
    const operation = this.businessContext.captureOperation();
    const offer = await this.repository.getById(id);
    operation.assertCurrent();
    await this.assertProductAccess(offer.productId, operation);
    operation.assertCurrent();
    return offer;
  }

  private async assertProductAccess(productId: string, operation: SessionOperation): Promise<void> {
    const product = await this.products.getById(String(productId));
    operation.assertCurrent();

    if (!this.businessContext.belongsToBusiness(product.businessId)) {
      throw new Error('El producto no pertenece al negocio activo.');
    }
  }

  private async validate(data: OfferChanges, operation: SessionOperation): Promise<void> {
    if (!data.productId || !data.title.trim()) {
      throw new Error('Seleccione un producto e ingrese un título.');
    }

    if (
      !Number.isFinite(data.discountPercentage) ||
      data.discountPercentage <= 0 ||
      data.discountPercentage >= 100
    ) {
      throw new Error('El descuento debe ser mayor que 0 y menor que 100.');
    }

    if (!data.startDate || !data.endDate || data.endDate < data.startDate) {
      throw new Error('Las fechas de vigencia no son válidas.');
    }

    await this.assertProductAccess(data.productId, operation);
    operation.assertCurrent();

    const product = await this.products.getById(data.productId);
    operation.assertCurrent();

    if (!product.active) {
      throw new Error('No se pueden crear ofertas para productos inactivos.');
    }
  }

  async create(data: NewOffer) {
    const operation = this.businessContext.captureOperation();
    await this.validate(data, operation);
    operation.assertCurrent();
    return operation.complete(this.repository.create(data));
  }

  async update(id: string, changes: OfferChanges) {
    const operation = this.businessContext.captureOperation();
    await this.getById(id);
    operation.assertCurrent();
    await this.validate(changes, operation);
    operation.assertCurrent();
    return operation.complete(this.repository.update(id, changes));
  }

  async changeStatus(id: string, active: boolean) {
    const operation = this.businessContext.captureOperation();
    const offer = await this.getById(id);
    operation.assertCurrent();

    if (active) {
      await this.validate(offer, operation);
    }
    operation.assertCurrent();
    return operation.complete(this.repository.changeStatus(id, active));
  }
}
