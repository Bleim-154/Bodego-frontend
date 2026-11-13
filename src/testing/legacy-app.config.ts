import { appConfig as runtimeConfig } from '../app/app.config';
// TEST ONLY: preserve historical mock behavior, never imported by the production entry point.
import { ProductRepository } from '../app/catalog/domain/product.repository';
import { ProductHttpRepository } from '../app/catalog/infrastructure/product-http.repository';
import { CategoryRepository } from '../app/catalog/domain/category.repository';
import { CategoryHttpRepository } from '../app/catalog/infrastructure/category-http.repository';
import { BatchRepository } from '../app/inventory/domain/batch.repository';
import { BatchHttpRepository } from '../app/inventory/infrastructure/batch-http.repository';
import { InventoryMovementRepository } from '../app/inventory/domain/inventory-movement.repository';
import { InventoryMovementHttpRepository } from '../app/inventory/infrastructure/inventory-movement-http.repository';
import { PhysicalCountRepository } from '../app/stock-control/domain/physical-count.repository';
import { PhysicalCountHttpRepository } from '../app/stock-control/infrastructure/physical-count-http.repository';
import { StockAdjustmentRepository } from '../app/stock-control/domain/stock-adjustment.repository';
import { StockAdjustmentHttpRepository } from '../app/stock-control/infrastructure/stock-adjustment-http.repository';
import { CorrectionRequestRepository } from '../app/stock-control/domain/correction-request.repository';
import { CorrectionRequestHttpRepository } from '../app/stock-control/infrastructure/correction-request-http.repository';
import { WasteRepository } from '../app/stock-control/domain/waste.repository';
import { WasteHttpRepository } from '../app/stock-control/infrastructure/waste-http.repository';
import { AlertRepository } from '../app/monitoring/domain/alert.repository';
import { AlertHttpRepository } from '../app/monitoring/infrastructure/alert-http.repository';
import { AuditLogRepository } from '../app/monitoring/domain/audit-log.repository';
import { AuditLogHttpRepository } from '../app/monitoring/infrastructure/audit-log-http.repository';
import { RecommendationRepository } from '../app/strategic-offers/domain/recommendation.repository';
import { RecommendationHttpRepository } from '../app/strategic-offers/infrastructure/recommendation-http.repository';
import { OfferRepository } from '../app/strategic-offers/domain/offer.repository';
import { OfferHttpRepository } from '../app/strategic-offers/infrastructure/offer-http.repository';
import { BusinessRepository } from '../app/iam/domain/business.repository';
import { BusinessHttpRepository } from '../app/iam/infrastructure/business-http.repository';
import { UserRepository } from '../app/iam/domain/user.repository';
import { UserHttpRepository } from '../app/iam/infrastructure/user-http.repository';

export const appConfig = {
  ...runtimeConfig,
  providers: [
    ...runtimeConfig.providers,
    {
      provide: ProductRepository,
      useClass: ProductHttpRepository,
    },
    {
      provide: CategoryRepository,
      useClass: CategoryHttpRepository,
    },
    {
      provide: BatchRepository,
      useClass: BatchHttpRepository,
    },
    {
      provide: InventoryMovementRepository,
      useClass: InventoryMovementHttpRepository,
    },
    {
      provide: PhysicalCountRepository,
      useClass: PhysicalCountHttpRepository,
    },
    {
      provide: StockAdjustmentRepository,
      useClass: StockAdjustmentHttpRepository,
    },
    {
      provide: CorrectionRequestRepository,
      useClass: CorrectionRequestHttpRepository,
    },
    {
      provide: WasteRepository,
      useClass: WasteHttpRepository,
    },
    {
      provide: AlertRepository,
      useClass: AlertHttpRepository,
    },
    {
      provide: AuditLogRepository,
      useClass: AuditLogHttpRepository,
    },
    {
      provide: RecommendationRepository,
      useClass: RecommendationHttpRepository,
    },
    {
      provide: OfferRepository,
      useClass: OfferHttpRepository,
    },
    {
      provide: BusinessRepository,
      useClass: BusinessHttpRepository,
    },
    {
      provide: UserRepository,
      useClass: UserHttpRepository,
    },
  ],
};
