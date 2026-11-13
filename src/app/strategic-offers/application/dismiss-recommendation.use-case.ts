import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { RecommendationRepository } from '../domain/recommendation.repository';
import { GetRecommendationsUseCase } from './get-recommendations.use-case';

@Injectable({ providedIn: 'root' })
export class DismissRecommendationUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: RecommendationRepository,
    private readonly getRecommendations: GetRecommendationsUseCase,
  ) {}

  async execute(id: string) {
    const operation = this.operationContext.captureOperation();
    const recommendations = await this.getRecommendations.execute();
    operation.assertCurrent();

    const recommendation = recommendations.find((item) => String(item.id) === String(id));

    if (!recommendation) {
      throw new Error('Recomendación no encontrada.');
    }

    if (recommendation.dismissed) {
      throw new Error('La recomendación ya fue descartada.');
    }

    operation.assertCurrent();
    return operation.complete(this.repository.dismiss(String(recommendation.id)));
  }
}
