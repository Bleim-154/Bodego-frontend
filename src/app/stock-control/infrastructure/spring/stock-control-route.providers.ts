import { Provider } from '@angular/core';
import { REAL_INVENTORY_PROVIDERS } from '../../../inventory/infrastructure/spring/inventory-route.providers';
import { PhysicalCountRepository } from '../../domain/physical-count.repository';
import { StockAdjustmentRepository } from '../../domain/stock-adjustment.repository';
import { WasteRepository } from '../../domain/waste.repository';
import { CorrectionRequestRepository } from '../../domain/correction-request.repository';
import { StockControlCommandPort } from '../../domain/stock-control-command.port';
import { GetPhysicalCountsUseCase } from '../../application/get-physical-counts.use-case';
import { GetStockAdjustmentsUseCase } from '../../application/get-stock-adjustments.use-case';
import { GetWastesUseCase } from '../../application/get-wastes.use-case';
import { GetCorrectionRequestsUseCase } from '../../application/get-correction-requests.use-case';
import { RegisterPhysicalCountUseCase } from '../../application/register-physical-count.use-case';
import { ApplyStockAdjustmentUseCase } from '../../application/apply-stock-adjustment.use-case';
import { RegisterWasteUseCase } from '../../application/register-waste.use-case';
import { CreateCorrectionRequestUseCase } from '../../application/create-correction-request.use-case';
import { ReviewCorrectionRequestUseCase } from '../../application/review-correction-request.use-case';
import {
  RegisterBackendPhysicalCountUseCase,
  ApplyBackendStockAdjustmentUseCase,
  RegisterBackendWasteUseCase,
  CreateBackendCorrectionRequestUseCase,
  ReviewBackendCorrectionRequestUseCase,
} from '../../application/backend-stock-control.use-cases';
import { StockControlBackendGateway } from './stock-control-backend.gateway';
import { SpringStockControlCommands } from './spring-stock-control-commands';
import {
  SpringPhysicalCountRepository,
  SpringStockAdjustmentRepository,
  SpringWasteRepository,
  SpringCorrectionRequestRepository,
} from './spring-stock-control.repositories';

// Both the ports AND dependent use cases must be scoped, never inherited from the JSON root graph.
export const REAL_STOCK_CONTROL_PROVIDERS: Provider[] = [
  ...REAL_INVENTORY_PROVIDERS,
  StockControlBackendGateway,
  { provide: PhysicalCountRepository, useClass: SpringPhysicalCountRepository },
  { provide: StockAdjustmentRepository, useClass: SpringStockAdjustmentRepository },
  { provide: WasteRepository, useClass: SpringWasteRepository },
  { provide: CorrectionRequestRepository, useClass: SpringCorrectionRequestRepository },
  { provide: StockControlCommandPort, useClass: SpringStockControlCommands },
  GetPhysicalCountsUseCase,
  GetStockAdjustmentsUseCase,
  GetWastesUseCase,
  GetCorrectionRequestsUseCase,
  { provide: RegisterPhysicalCountUseCase, useClass: RegisterBackendPhysicalCountUseCase },
  { provide: ApplyStockAdjustmentUseCase, useClass: ApplyBackendStockAdjustmentUseCase },
  { provide: RegisterWasteUseCase, useClass: RegisterBackendWasteUseCase },
  { provide: CreateCorrectionRequestUseCase, useClass: CreateBackendCorrectionRequestUseCase },
  { provide: ReviewCorrectionRequestUseCase, useClass: ReviewBackendCorrectionRequestUseCase },
];
