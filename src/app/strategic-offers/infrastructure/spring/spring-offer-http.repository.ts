import { inject, Injectable } from '@angular/core';
import { OfferRepository, NewOffer, OfferChanges } from '../../domain/offer.repository';
import { backendIdentifier } from '../../../shared/infrastructure/backend-identifier';
import { StrategicOffersBackendGateway } from './strategic-offers-backend.gateway';
import { offerFromBackend, offerInformation } from './strategic-offers-backend.contract';

@Injectable()
export class SpringOfferHttpRepository extends OfferRepository {
  private readonly gateway = inject(StrategicOffersBackendGateway);
  async getAll() {
    const op = this.gateway.capture();
    const response = await this.gateway.request(op, 'GET', '/offers');
    op.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de ofertas no válida.');
    return response.map((row) => offerFromBackend(row, op.businessId));
  }
  async getById(id: string) {
    const op = this.gateway.capture();
    const key = String(backendIdentifier(id));
    const response = await this.gateway.request(op, 'GET', `/offers/${key}`);
    op.assertCurrent();
    return offerFromBackend(response, op.businessId, key);
  }
  async create(data: NewOffer) {
    const op = this.gateway.capture();
    if (data.active !== true) throw new Error('Las ofertas nuevas se crean activas.');
    const response = await this.gateway.request(op, 'POST', '/offers', {
      businessId: backendIdentifier(op.businessId),
      productId: backendIdentifier(data.productId),
      ...offerInformation(data),
    });
    op.assertCurrent();
    return offerFromBackend(response, op.businessId);
  }
  async update(id: string, changes: OfferChanges) {
    const op = this.gateway.capture();
    const key = String(backendIdentifier(id));
    const productId = String(backendIdentifier(changes.productId));
    const information = offerInformation(changes);
    const current = await this.getById(key);
    op.assertRole('ADMIN');
    if (current.productId !== productId) throw new Error('El producto de la oferta es inmutable.');
    const response = await this.gateway.request(op, 'PUT', `/offers/${key}`, information);
    op.assertCurrent();
    return offerFromBackend(response, op.businessId, key);
  }
  async changeStatus(id: string, active: boolean) {
    const op = this.gateway.capture();
    if (typeof active !== 'boolean') throw new Error('Estado no válido.');
    const key = String(backendIdentifier(id));
    const response = await this.gateway.request(
      op,
      'PATCH',
      `/offers/${key}/${active ? 'activate' : 'deactivate'}`,
    );
    op.assertCurrent();
    return offerFromBackend(response, op.businessId, key);
  }
}
