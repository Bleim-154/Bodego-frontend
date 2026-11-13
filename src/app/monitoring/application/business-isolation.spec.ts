import { TestBed } from '@angular/core/testing';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';
import { SessionService } from '../../iam/application/session.service';
import { AlertRepository } from '../domain/alert.repository';
import { AuditLogRepository } from '../domain/audit-log.repository';
import { RecommendationRepository } from '../../strategic-offers/domain/recommendation.repository';
import { OfferRepository } from '../../strategic-offers/domain/offer.repository';
import { GetAlertsUseCase } from './get-alerts.use-case';
import { ResolveAlertUseCase } from './resolve-alert.use-case';
import { GenerateAlertsUseCase } from './generate-alerts.use-case';
import { RegisterAuditLogUseCase } from './register-audit-log.use-case';
import { GetAuditLogsUseCase } from './get-audit-logs.use-case';
import { GetRecommendationsUseCase } from '../../strategic-offers/application/get-recommendations.use-case';
import { DismissRecommendationUseCase } from '../../strategic-offers/application/dismiss-recommendation.use-case';
import { GenerateRecommendationsUseCase } from '../../strategic-offers/application/generate-recommendations.use-case';
import { ManageOffersUseCase } from '../../strategic-offers/application/manage-offers.use-case';

describe('Monitoring and StrategicOffers business isolation', () => {
  const products = [
    { id: 'p1', businessId: 1, name: 'Own', active: true, minimumStock: 10 },
    { id: 'p2', businessId: 2, name: 'Other', active: true, minimumStock: 10 },
    { id: 'p3', businessId: 1, name: 'Overstock', active: true, minimumStock: 1 },
  ];
  const batches = products.map((product) => ({
    id: `b-${product.id}`, productId: product.id, code: product.id,
    availableQuantity: 5, expirationDate: '2026-11-05',
  }));
  const records = products.map((product) => ({ id: product.id, productId: product.id, resolved: false, dismissed: false }));
  const offerData = { productId: 'p1', title: 'Offer', discountPercentage: 10, startDate: '2026-11-01', endDate: '2026-11-30', active: true };
  const productRepository = {
    getAll: vi.fn(async () => products),
    getById: vi.fn(async (id: string) => products.find((product) => product.id === id)),
  };
  const alerts = { getAll: vi.fn(), create: vi.fn(), markResolved: vi.fn() };
  const recommendations = { getAll: vi.fn(), create: vi.fn(), dismiss: vi.fn() };
  const offers = { getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), changeStatus: vi.fn() };
  const audit = { getAll: vi.fn(), create: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    productRepository.getAll.mockResolvedValue(products);
    productRepository.getById.mockImplementation(async (id) => products.find((product) => product.id === id));
    alerts.markResolved.mockResolvedValue(undefined);
    recommendations.dismiss.mockResolvedValue(undefined);
    offers.create.mockResolvedValue(undefined);
    offers.update.mockResolvedValue(undefined);
    offers.changeStatus.mockResolvedValue(undefined);
    alerts.getAll.mockResolvedValue(records);
    recommendations.getAll.mockResolvedValue(records);
    offers.getAll.mockResolvedValue(records);
    offers.getById.mockImplementation(async (id) => ({ ...offerData, id, productId: id }));
    audit.getAll.mockResolvedValue([{ id: 'own', businessId: '1' }, { id: 'other', businessId: '2' }, { id: 'legacy' }]);
    TestBed.configureTestingModule({ providers: [
      { provide: ProductRepository, useValue: productRepository },
      { provide: BatchRepository, useValue: { getAll: async () => batches } },
      { provide: AlertRepository, useValue: alerts },
      { provide: RecommendationRepository, useValue: recommendations },
      { provide: OfferRepository, useValue: offers },
      { provide: AuditLogRepository, useValue: audit },
    ] });
    TestBed.inject(SessionService).startSession(
      { id: 'user1', businessId: '1', fullName: 'User', email: 'user@example.test', role: 'ADMIN', active: true },
      { id: '1', name: 'Business', address: '', phone: '', active: true },
    );
  });

  afterEach(() => vi.useRealTimers());

  it('filters alerts, recommendations, offers and audit logs, preserving legacy records', async () => {
    expect((await TestBed.inject(GetAlertsUseCase).execute()).map((item) => item.id)).toEqual(['p1', 'p3']);
    expect((await TestBed.inject(GetRecommendationsUseCase).execute()).map((item) => item.id)).toEqual(['p1', 'p3']);
    expect((await TestBed.inject(ManageOffersUseCase).getAll()).map((item) => item.id)).toEqual(['p1', 'p3']);
    expect((await TestBed.inject(GetAuditLogsUseCase).execute()).map((item) => item.id)).toEqual(['own']);
    expect(await audit.getAll()).toHaveLength(3);
  });

  it('resolves and dismisses only records belonging to the active business', async () => {
    await expect(TestBed.inject(ResolveAlertUseCase).execute('p2')).rejects.toThrow('La alerta no pertenece');
    await expect(TestBed.inject(DismissRecommendationUseCase).execute('p2')).rejects.toThrow('Recomendación no encontrada');
    expect(alerts.markResolved).not.toHaveBeenCalled();
    expect(recommendations.dismiss).not.toHaveBeenCalled();
    await TestBed.inject(ResolveAlertUseCase).execute('p1');
    await TestBed.inject(DismissRecommendationUseCase).execute('p1');
    expect(alerts.markResolved).toHaveBeenCalledWith('p1');
    expect(recommendations.dismiss).toHaveBeenCalledWith('p1');
  });

  it('blocks reading, creating, updating and toggling offers from other businesses', async () => {
    const manage = TestBed.inject(ManageOffersUseCase);
    await expect(manage.getById('p2')).rejects.toThrow('El producto no pertenece');
    await expect(manage.create({ ...offerData, productId: 'p2' })).rejects.toThrow('El producto no pertenece');
    await expect(manage.update('p2', offerData)).rejects.toThrow('El producto no pertenece');
    await expect(manage.update('p1', { ...offerData, productId: 'p2' })).rejects.toThrow('El producto no pertenece');
    await expect(manage.changeStatus('p2', true)).rejects.toThrow('El producto no pertenece');
    await expect(manage.changeStatus('p2', false)).rejects.toThrow('El producto no pertenece');
    expect(offers.create).not.toHaveBeenCalled();
    expect(offers.update).not.toHaveBeenCalled();
    expect(offers.changeStatus).not.toHaveBeenCalled();
    await manage.create(offerData);
    await manage.update('p1', offerData);
    await manage.changeStatus('p1', false);
    expect(offers.create).toHaveBeenCalledWith(offerData);
    expect(offers.update).toHaveBeenCalledWith('p1', offerData);
    expect(offers.changeStatus).toHaveBeenCalledWith('p1', false);
  });

  it('preserves offer discount, dates and inactive-product validation', async () => {
    const manage = TestBed.inject(ManageOffersUseCase);
    await expect(manage.create({ ...offerData, discountPercentage: 100 })).rejects.toThrow('El descuento');
    await expect(manage.create({ ...offerData, endDate: '2026-10-01' })).rejects.toThrow('Las fechas');
    productRepository.getById.mockResolvedValue({ ...products[0], active: false });
    await expect(manage.create(offerData)).rejects.toThrow('productos inactivos');
    expect(offers.create).not.toHaveBeenCalled();
  });

  it('generates only own alerts and recommendations while preserving rules and deduplication', async () => {
    alerts.getAll.mockResolvedValue([]);
    recommendations.getAll.mockResolvedValue([]);
    expect(await TestBed.inject(GenerateAlertsUseCase).execute()).toBe(3);
    expect(await TestBed.inject(GenerateRecommendationsUseCase).execute()).toBe(4);
    const generatedAlerts = alerts.create.mock.calls.map(([record]) => record);
    const generatedRecommendations = recommendations.create.mock.calls.map(([record]) => record);
    expect(generatedAlerts.map((record) => record.type)).toEqual(['LOW_STOCK', 'EXPIRING', 'EXPIRING']);
    expect(generatedRecommendations.map((record) => record.type)).toEqual(['RESTOCK', 'EXPIRING', 'OVERSTOCK', 'EXPIRING']);
    expect([...generatedAlerts, ...generatedRecommendations].every((record) => record.productId !== 'p2')).toBe(true);
    alerts.getAll.mockResolvedValue(generatedAlerts);
    recommendations.getAll.mockResolvedValue(generatedRecommendations);
    alerts.create.mockClear();
    recommendations.create.mockClear();
    expect(await TestBed.inject(GenerateAlertsUseCase).execute()).toBe(0);
    expect(await TestBed.inject(GenerateRecommendationsUseCase).execute()).toBe(0);
    expect(alerts.create).not.toHaveBeenCalled();
    expect(recommendations.create).not.toHaveBeenCalled();
  });

  it('records the business and authenticated user, overriding a supplied user ID', async () => {
    TestBed.inject(RegisterAuditLogUseCase).execute({
      action: 'PRODUCT_CREATED', entityType: 'Product', entityId: 'p1', description: 'Created', userId: 'different-user',
    });
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ businessId: '1', userId: 'user1' }));
  });
});
