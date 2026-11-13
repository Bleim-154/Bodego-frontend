import { Injectable, inject } from '@angular/core';

import { Offer } from '../domain/model/offer.entity';
import { OfferRepository, NewOffer, OfferChanges } from '../domain/offer.repository';
import { OffersApiEndpoint } from './offers-api-endpoint';
import { OfferAssembler } from './assemblers/offer.assembler';

@Injectable()
export class OfferHttpRepository extends OfferRepository {
  private readonly endpoint = inject(OffersApiEndpoint);

  override async getAll(): Promise<Offer[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => OfferAssembler.toEntity(response));
  }

  override async create(data: NewOffer): Promise<Offer> {
    const response = await this.endpoint.create(data);
    return OfferAssembler.toEntity(response);
  }

  override async getById(id: string): Promise<Offer> {
    const response = await this.endpoint.getById(id);
    return OfferAssembler.toEntity(response);
  }

  override async update(id: string, changes: OfferChanges): Promise<Offer> {
    const response = await this.endpoint.update(id, changes);
    return OfferAssembler.toEntity(response);
  }

  override async changeStatus(id: string, active: boolean): Promise<Offer> {
    const response = await this.endpoint.update(id, { active });
    return OfferAssembler.toEntity(response);
  }
}
