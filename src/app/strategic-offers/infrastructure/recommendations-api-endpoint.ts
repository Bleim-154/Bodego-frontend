import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewRecommendation } from '../domain/recommendation.repository';
import { RecommendationResponse } from './responses/recommendation.response';
import { STRATEGIC_OFFERS_ENDPOINTS } from './strategic-offers-endpoints';

@Injectable({ providedIn: 'root' })
export class RecommendationsApiEndpoint extends BaseApiEndpoint<
  RecommendationResponse,
  NewRecommendation,
  { dismissed: boolean }
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + STRATEGIC_OFFERS_ENDPOINTS.recommendations);
  }
}
