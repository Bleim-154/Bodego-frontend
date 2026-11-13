import { inject, Injectable } from '@angular/core';
import { BusinessContextService } from '../../iam/application/business-context.service';
import { RecommendationRepository } from '../domain/recommendation.repository';
import { RecommendationGenerationPort } from '../domain/recommendation-generation.port';
import { OfferRepository, NewOffer, OfferChanges } from '../domain/offer.repository';

async function admin<T>(context: BusinessContextService, action: () => Promise<T>): Promise<T> {
  const operation = context.captureOperation();
  operation.assertRole('ADMIN');
  return operation.complete(action());
}
@Injectable()
export class GetBackendRecommendationsUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(RecommendationRepository);
  execute() {
    return admin(this.context, () => this.repository.getAll());
  }
}
@Injectable()
export class GenerateBackendRecommendationsUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly generation = inject(RecommendationGenerationPort);
  async execute() {
    return (await admin(this.context, () => this.generation.generate())).length;
  }
}
@Injectable()
export class DismissBackendRecommendationUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(RecommendationRepository);
  execute(id: string) {
    return admin(this.context, () => this.repository.dismiss(id));
  }
}
@Injectable()
export class ManageBackendOffersUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(OfferRepository);
  getAll() {
    return admin(this.context, () => this.repository.getAll());
  }
  getById(id: string) {
    return admin(this.context, () => this.repository.getById(id));
  }
  create(data: NewOffer) {
    return admin(this.context, () => this.repository.create(data));
  }
  update(id: string, changes: OfferChanges) {
    return admin(this.context, () => this.repository.update(id, changes));
  }
  changeStatus(id: string, active: boolean) {
    return admin(this.context, () => this.repository.changeStatus(id, active));
  }
}
