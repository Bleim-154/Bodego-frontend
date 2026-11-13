import { Provider } from '@angular/core';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { CatalogBackendGateway } from '../../catalog/infrastructure/spring/catalog-backend.gateway';
import { SpringProductHttpRepository } from '../../catalog/infrastructure/spring/spring-product-http.repository';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { InventoryMovementRepository } from '../../inventory/domain/inventory-movement.repository';
import { InventoryBackendGateway } from '../../inventory/infrastructure/spring/inventory-backend.gateway';
import { SpringBatchHttpRepository } from '../../inventory/infrastructure/spring/spring-batch-http.repository';
import { SpringInventoryMovementHttpRepository } from '../../inventory/infrastructure/spring/spring-inventory-movement-http.repository';
import { AlertRepository } from '../../monitoring/domain/alert.repository';
import { MonitoringBackendGateway } from '../../monitoring/infrastructure/spring/monitoring-backend.gateway';
import { SpringAlertHttpRepository } from '../../monitoring/infrastructure/spring/spring-alert-http.repository';
import { DashboardReadPort } from '../domain/dashboard-read.port';
import { GetDashboardUseCase } from '../application/get-dashboard.use-case';
import { SpringDashboardReadRepository } from './spring-dashboard-read.repository';

// No generator or command use cases are provided to the Dashboard.
export const REAL_DASHBOARD_PROVIDERS: Provider[] = [
  CatalogBackendGateway,
  InventoryBackendGateway,
  MonitoringBackendGateway,
  { provide: ProductRepository, useClass: SpringProductHttpRepository },
  { provide: BatchRepository, useClass: SpringBatchHttpRepository },
  { provide: InventoryMovementRepository, useClass: SpringInventoryMovementHttpRepository },
  { provide: AlertRepository, useClass: SpringAlertHttpRepository },
  { provide: DashboardReadPort, useClass: SpringDashboardReadRepository },
  GetDashboardUseCase,
];
