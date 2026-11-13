import { Provider } from '@angular/core';
import { ProductRepository } from '../../../catalog/domain/product.repository';
import { SpringProductHttpRepository } from '../../../catalog/infrastructure/spring/spring-product-http.repository';
import { CatalogBackendGateway } from '../../../catalog/infrastructure/spring/catalog-backend.gateway';
import { GetProductsUseCase } from '../../../catalog/application/get-products.use-case';
import { OfferRepository } from '../../domain/offer.repository';
import { RecommendationRepository } from '../../domain/recommendation.repository';
import { RecommendationGenerationPort } from '../../domain/recommendation-generation.port';
import { GetRecommendationsUseCase } from '../../application/get-recommendations.use-case';
import { GenerateRecommendationsUseCase } from '../../application/generate-recommendations.use-case';
import { DismissRecommendationUseCase } from '../../application/dismiss-recommendation.use-case';
import { ManageOffersUseCase } from '../../application/manage-offers.use-case';
import {
  GetBackendRecommendationsUseCase,
  GenerateBackendRecommendationsUseCase,
  DismissBackendRecommendationUseCase,
  ManageBackendOffersUseCase,
} from '../../application/backend-strategic-offers.use-cases';
import { StrategicOffersBackendGateway } from './strategic-offers-backend.gateway';
import { SpringOfferHttpRepository } from './spring-offer-http.repository';
import { SpringRecommendationHttpRepository } from './spring-recommendation-http.repository';
import { AuditLogRepository } from '../../../monitoring/domain/audit-log.repository';
import { SpringAuditLogHttpRepository } from '../../../monitoring/infrastructure/spring/spring-audit-log-http.repository';
import { MonitoringBackendGateway } from '../../../monitoring/infrastructure/spring/monitoring-backend.gateway';
import { RegisterAuditLogUseCase } from '../../../monitoring/application/register-audit-log.use-case';

export const REAL_STRATEGIC_OFFERS_PROVIDERS: Provider[] = [
  StrategicOffersBackendGateway,
  CatalogBackendGateway,
  GetProductsUseCase,
  { provide: ProductRepository, useClass: SpringProductHttpRepository },
  { provide: OfferRepository, useClass: SpringOfferHttpRepository },
  { provide: RecommendationRepository, useClass: SpringRecommendationHttpRepository },
  { provide: RecommendationGenerationPort, useExisting: RecommendationRepository },
  { provide: GetRecommendationsUseCase, useClass: GetBackendRecommendationsUseCase },
  { provide: GenerateRecommendationsUseCase, useClass: GenerateBackendRecommendationsUseCase },
  { provide: DismissRecommendationUseCase, useClass: DismissBackendRecommendationUseCase },
  { provide: ManageOffersUseCase, useClass: ManageBackendOffersUseCase },
  MonitoringBackendGateway,
  { provide: AuditLogRepository, useClass: SpringAuditLogHttpRepository },
  RegisterAuditLogUseCase,
];
