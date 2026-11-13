import { inject, Injectable } from '@angular/core';
import {
  RecommendationRepository,
  NewRecommendation,
} from '../../domain/recommendation.repository';
import { RecommendationGenerationPort } from '../../domain/recommendation-generation.port';
import { backendIdentifier } from '../../../shared/infrastructure/backend-identifier';
import { StrategicOffersBackendGateway } from './strategic-offers-backend.gateway';
import { recommendationFromBackend } from './strategic-offers-backend.contract';

@Injectable()
export class SpringRecommendationHttpRepository
  extends RecommendationRepository
  implements RecommendationGenerationPort
{
  private readonly gateway = inject(StrategicOffersBackendGateway);
  async getAll() {
    const op = this.gateway.capture();
    const response = await this.gateway.request(op, 'GET', '/recommendations');
    op.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de recomendaciones no válida.');
    return response.map((row) => recommendationFromBackend(row, op.businessId));
  }
  async generate() {
    const op = this.gateway.capture();
    const response = await this.gateway.request(op, 'POST', '/recommendations/generate', {
      businessId: backendIdentifier(op.businessId),
    });
    op.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de generación no válida.');
    return response.map((row) => recommendationFromBackend(row, op.businessId));
  }
  async dismiss(id: string) {
    const op = this.gateway.capture();
    const key = String(backendIdentifier(id));
    const response = await this.gateway.request(op, 'PATCH', `/recommendations/${key}/dismiss`);
    op.assertCurrent();
    return recommendationFromBackend(response, op.businessId, key);
  }
  async create(_data: NewRecommendation): Promise<never> {
    throw new Error('Las recomendaciones reales se generan exclusivamente en el backend.');
  }
}
