import { Routes } from '@angular/router';
import { REAL_IAM_MANAGEMENT_PROVIDERS } from './iam/infrastructure/spring/iam-management-route.providers';
import { REAL_DASHBOARD_PROVIDERS } from './dashboard/infrastructure/dashboard-route.providers';
import { REAL_STRATEGIC_OFFERS_PROVIDERS } from './strategic-offers/infrastructure/spring/strategic-offers-route.providers';
import { REAL_MONITORING_PROVIDERS } from './monitoring/infrastructure/spring/monitoring-route.providers';
import { REAL_STOCK_CONTROL_PROVIDERS } from './stock-control/infrastructure/spring/stock-control-route.providers';

// Dashboard
import { Dashboard } from './dashboard/presentation/dashboard/dashboard';

// Catálogo
import { ProductList } from './catalog/presentation/product-list/product-list';
import { ProductCreate } from './catalog/presentation/product-create/product-create';
import { ProductEdit } from './catalog/presentation/product-edit/product-edit';
import { CategoryList } from './catalog/presentation/category-list/category-list';
import { CategoryCreate } from './catalog/presentation/category-create/category-create';
import { CategoryEdit } from './catalog/presentation/category-edit/category-edit';

// Inventario
import { BatchList } from './inventory/presentation/batch-list/batch-list';
import { BatchCreate } from './inventory/presentation/batch-create/batch-create';
import { MovementCreate } from './inventory/presentation/movement-create/movement-create';
import { MovementList } from './inventory/presentation/movement-list/movement-list';

// Control de stock
import { PhysicalCountList } from './stock-control/presentation/physical-count-list/physical-count-list';
import { PhysicalCountCreate } from './stock-control/presentation/physical-count-create/physical-count-create';
import { StockAdjustmentList } from './stock-control/presentation/stock-adjustment-list/stock-adjustment-list';
import { StockAdjustmentCreate } from './stock-control/presentation/stock-adjustment-create/stock-adjustment-create';
import { CorrectionRequestList } from './stock-control/presentation/correction-request-list/correction-request-list';
import { WasteManagement } from './stock-control/presentation/waste-management/waste-management';

// Monitoreo
import { AlertManagement } from './monitoring/presentation/alert-management/alert-management';
import { AuditLogList } from './monitoring/presentation/audit-log-list/audit-log-list';

// Ofertas estratégicas
import { RecommendationManagement } from './strategic-offers/presentation/recommendation-management/recommendation-management';
import { OfferManagement } from './strategic-offers/presentation/offer-management/offer-management';

// IAM
import { BusinessManagement } from './iam/presentation/business-management/business-management';
import { UserManagement } from './iam/presentation/user-management/user-management';
import { SessionSelector } from './iam/presentation/session-selector/session-selector';

// Guards
import { authGuard } from './iam/application/auth.guard';
import { roleGuard } from './iam/application/role.guard';
import { REAL_CATALOG_PROVIDERS } from './catalog/infrastructure/spring/catalog-route.providers';
import { REAL_INVENTORY_PROVIDERS } from './inventory/infrastructure/spring/inventory-route.providers';
import { BatchEdit } from './inventory/presentation/batch-edit/batch-edit';

export const routes: Routes = [
  // RUTAS PÚBLICAS

  {
    path: '',
    redirectTo: 'session',
    pathMatch: 'full',
  },
  {
    path: 'session',
    component: SessionSelector,
    data: { public: true },
  },

  // DASHBOARD

  {
    path: 'dashboard',
    providers: REAL_DASHBOARD_PROVIDERS,
    component: Dashboard,
    canActivate: [authGuard],
  },
  // CATÁLOGO

  {
    path: 'products',
    providers: REAL_CATALOG_PROVIDERS,
    component: ProductList,
    canActivate: [authGuard],
  },
  {
    path: 'products/new',
    providers: REAL_CATALOG_PROVIDERS,
    component: ProductCreate,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'products/edit/:id',
    providers: REAL_CATALOG_PROVIDERS,
    component: ProductEdit,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'categories',
    providers: REAL_CATALOG_PROVIDERS,
    component: CategoryList,
    canActivate: [authGuard],
  },
  {
    path: 'categories/new',
    providers: REAL_CATALOG_PROVIDERS,
    component: CategoryCreate,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'categories/edit/:id',
    providers: REAL_CATALOG_PROVIDERS,
    component: CategoryEdit,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },

  // INVENTARIO

  {
    path: 'batches',
    providers: REAL_INVENTORY_PROVIDERS,
    component: BatchList,
    canActivate: [authGuard],
  },
  {
    path: 'batches/new',
    providers: REAL_INVENTORY_PROVIDERS,
    component: BatchCreate,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'batches/edit/:id',
    providers: REAL_INVENTORY_PROVIDERS,
    component: BatchEdit,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'inventory/movements',
    providers: REAL_INVENTORY_PROVIDERS,
    component: MovementList,
    canActivate: [authGuard],
  },
  {
    path: 'inventory/movements/new',
    providers: REAL_INVENTORY_PROVIDERS,
    component: MovementCreate,
    canActivate: [authGuard],
  },
  // CONTROL DE STOCK

  {
    path: 'stock-control/counts',
    providers: REAL_STOCK_CONTROL_PROVIDERS,
    component: PhysicalCountList,
    canActivate: [authGuard],
  },
  {
    path: 'stock-control/counts/new',
    providers: REAL_STOCK_CONTROL_PROVIDERS,
    component: PhysicalCountCreate,
    canActivate: [authGuard],
  },
  {
    path: 'stock-control/adjustments',
    providers: REAL_STOCK_CONTROL_PROVIDERS,
    component: StockAdjustmentList,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'stock-control/adjustments/new',
    providers: REAL_STOCK_CONTROL_PROVIDERS,
    component: StockAdjustmentCreate,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'stock-control/correction-requests',
    providers: REAL_STOCK_CONTROL_PROVIDERS,
    component: CorrectionRequestList,
    canActivate: [authGuard],
  },
  {
    path: 'stock-control/wastes',
    providers: REAL_STOCK_CONTROL_PROVIDERS,
    component: WasteManagement,
    canActivate: [authGuard],
  },

  // MONITOREO - ADMIN

  {
    path: 'monitoring/alerts',
    providers: REAL_MONITORING_PROVIDERS,
    component: AlertManagement,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'monitoring/audit',
    providers: REAL_MONITORING_PROVIDERS,
    component: AuditLogList,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  // OFERTAS ESTRATÉGICAS - ADMIN

  {
    path: 'strategic-offers/recommendations',
    providers: REAL_STRATEGIC_OFFERS_PROVIDERS,
    component: RecommendationManagement,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'strategic-offers/offers',
    providers: REAL_STRATEGIC_OFFERS_PROVIDERS,
    component: OfferManagement,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  // IAM - ADMIN
  {
    path: 'iam/businesses',
    providers: REAL_IAM_MANAGEMENT_PROVIDERS,
    component: BusinessManagement,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'iam/users',
    providers: REAL_IAM_MANAGEMENT_PROVIDERS,
    component: UserManagement,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
  },
  // RUTA NO ENCONTRADA
  {
    path: '**',
    redirectTo: 'session',
  },
];
