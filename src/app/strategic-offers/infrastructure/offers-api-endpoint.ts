import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewOffer, OfferChanges } from '../domain/offer.repository';
import { Offer } from '../domain/model/offer.entity';
import { OfferResponse } from './responses/offer.response';
import { STRATEGIC_OFFERS_ENDPOINTS } from './strategic-offers-endpoints';

@Injectable({ providedIn: 'root' })
export class OffersApiEndpoint extends BaseApiEndpoint<
  OfferResponse,
  NewOffer,
  OfferChanges | Pick<Offer, 'active'>
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + STRATEGIC_OFFERS_ENDPOINTS.offers);
  }
}
