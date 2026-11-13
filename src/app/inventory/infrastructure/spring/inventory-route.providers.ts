import { Provider } from '@angular/core';
import { ProductRepository } from '../../../catalog/domain/product.repository';
import { SpringProductHttpRepository } from '../../../catalog/infrastructure/spring/spring-product-http.repository';
import { CatalogBackendGateway } from '../../../catalog/infrastructure/spring/catalog-backend.gateway';
import { GetProductsUseCase } from '../../../catalog/application/get-products.use-case';
import { BatchRepository } from '../../domain/batch.repository';
import { BatchMetadataRepository } from '../../domain/batch-metadata.repository';
import { InventoryMovementRepository } from '../../domain/inventory-movement.repository';
import { GetBatchesUseCase } from '../../application/get-batches.use-case';
import { GetInventoryMovementsUseCase } from '../../application/get-inventory-movements.use-case';
import { CreateBatchUseCase } from '../../application/create-batch.use-case';
import { CreateBackendBatchUseCase } from '../../application/create-backend-batch.use-case';
import { RegisterInventoryMovementUseCase } from '../../application/register-inventory-movement.use-case';
import { RegisterBackendInventoryMovementUseCase } from '../../application/register-backend-inventory-movement.use-case';
import { UpdateBatchMetadataUseCase } from '../../application/update-batch-metadata.use-case';
import { InventoryBackendGateway } from './inventory-backend.gateway';
import { SpringBatchHttpRepository } from './spring-batch-http.repository';
import { SpringInventoryMovementHttpRepository } from './spring-inventory-movement-http.repository';

// Route-local real ports + use cases; pending modules keep the root JSON graph.
export const REAL_INVENTORY_PROVIDERS: Provider[] = [
  InventoryBackendGateway,
  CatalogBackendGateway,
  { provide: ProductRepository, useClass: SpringProductHttpRepository },
  GetProductsUseCase,
  { provide: BatchRepository, useClass: SpringBatchHttpRepository },
  { provide: BatchMetadataRepository, useExisting: BatchRepository },
  { provide: InventoryMovementRepository, useClass: SpringInventoryMovementHttpRepository },
  GetBatchesUseCase,
  GetInventoryMovementsUseCase,
  UpdateBatchMetadataUseCase,
  { provide: CreateBatchUseCase, useClass: CreateBackendBatchUseCase },
  { provide: RegisterInventoryMovementUseCase, useClass: RegisterBackendInventoryMovementUseCase },
];
