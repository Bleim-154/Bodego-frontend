import { Injectable, inject } from '@angular/core';

import { Recommendation } from '../domain/model/recommendation.entity';
import { RecommendationRepository, NewRecommendation } from '../domain/recommendation.repository';
import { RecommendationsApiEndpoint } from './recommendations-api-endpoint';
import { RecommendationAssembler } from './assemblers/recommendation.assembler';

@Injectable()
export class RecommendationHttpRepository extends RecommendationRepository {
  private readonly endpoint = inject(RecommendationsApiEndpoint);

  override async getAll(): Promise<Recommendation[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => RecommendationAssembler.toEntity(response));
  }

  override async create(data: NewRecommendation): Promise<Recommendation> {
    const response = await this.endpoint.create(data);
    return RecommendationAssembler.toEntity(response);
  }

  override async dismiss(id: string): Promise<Recommendation> {
    const response = await this.endpoint.update(id, { dismissed: true });
    return RecommendationAssembler.toEntity(response);
  }
}
