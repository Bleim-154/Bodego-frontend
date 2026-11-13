import { SessionService } from '../../iam/application/session.service';
import { TestBed } from '@angular/core/testing';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';
import { BatchAccessService } from '../../inventory/application/batch-access.service';
import { RegisterInventoryMovementUseCase } from '../../inventory/application/register-inventory-movement.use-case';
import { RegisterAuditLogUseCase } from '../../monitoring/application/register-audit-log.use-case';
import { PhysicalCountRepository } from '../domain/physical-count.repository';
import { StockAdjustmentRepository } from '../domain/stock-adjustment.repository';
import { CorrectionRequestRepository } from '../domain/correction-request.repository';
import { WasteRepository } from '../domain/waste.repository';
import { RegisterPhysicalCountUseCase } from './register-physical-count.use-case';
import { GetPhysicalCountsUseCase } from './get-physical-counts.use-case';
import { ApplyStockAdjustmentUseCase } from './apply-stock-adjustment.use-case';
import { GetStockAdjustmentsUseCase } from './get-stock-adjustments.use-case';
import { CreateCorrectionRequestUseCase } from './create-correction-request.use-case';
import { ReviewCorrectionRequestUseCase } from './review-correction-request.use-case';
import { RegisterWasteUseCase } from './register-waste.use-case';
import { GetWastesUseCase } from './get-wastes.use-case';
import { CorrectionRequestList } from '../presentation/correction-request-list/correction-request-list';

describe('StockControl business isolation', () => {
  const batches = [
    { id: 'b1', productId: 'p1', code: 'OWN', availableQuantity: 10 },
    { id: 'b2', productId: 'p2', code: 'OTHER', availableQuantity: 10 },
  ];
  const counts = batches.map((batch, index) => ({
    id: `c${index + 1}`, batchId: batch.id, systemQuantity: 10,
    countedQuantity: 8, difference: -2, observation: null, countedAt: '2026-11-04',
  }));
  const requests = counts.map((count, index) => ({
    id: `r${index + 1}`, physicalCountId: count.id, reason: 'Review', status: 'PENDING',
  }));
  const batchRepository = {
    getAll: vi.fn(async () => batches),
    getById: vi.fn(async (id: string) => batches.find((batch) => batch.id === id)),
    updateQuantity: vi.fn(),
  };
  const countRepository = { getAll: vi.fn(async () => counts), create: vi.fn() };
  const adjustmentRepository = { getAll: vi.fn(async () => []), create: vi.fn() };
  const requestRepository = { getAll: vi.fn(async () => requests), create: vi.fn(), update: vi.fn() };
  const wasteRepository = { getAll: vi.fn(async () => []), create: vi.fn() };
  const movement = { execute: vi.fn(), executeForStockAdjustment(command: unknown) { return this.execute(command); } };
  const audit = { execute: vi.fn(), forOperation() { return { execute: this.execute }; } };

  beforeEach(() => {
    vi.resetAllMocks();
    batchRepository.getAll.mockResolvedValue(batches);
    batchRepository.getById.mockImplementation(async (id) => batches.find((batch) => batch.id === id));
    countRepository.getAll.mockResolvedValue(counts);
    adjustmentRepository.getAll.mockResolvedValue([]);
    requestRepository.getAll.mockResolvedValue(requests);
    wasteRepository.getAll.mockResolvedValue([]);
    countRepository.create.mockImplementation(async (data) => ({ id: 'new-count', ...data }));
    adjustmentRepository.create.mockImplementation(async (data) => ({ id: 'new-adjustment', ...data }));
    requestRepository.create.mockImplementation(async (data) => ({ id: 'new-request', ...data }));
    requestRepository.update.mockImplementation(async (id, data) => ({ id, ...data }));
    wasteRepository.create.mockImplementation(async (data) => ({ id: 'new-waste', ...data }));
    TestBed.configureTestingModule({ providers: [
      { provide: BatchRepository, useValue: batchRepository },
      { provide: ProductRepository, useValue: {
        getAll: async () => [{ id: 'p1', businessId: 1 }, { id: 'p2', businessId: 2 }],
        getById: async (id: string) => ({ id, businessId: id === 'p1' ? 1 : 2 }),
      } },
      { provide: PhysicalCountRepository, useValue: countRepository },
      { provide: StockAdjustmentRepository, useValue: adjustmentRepository },
      { provide: CorrectionRequestRepository, useValue: requestRepository },
      { provide: WasteRepository, useValue: wasteRepository },
      { provide: RegisterInventoryMovementUseCase, useValue: movement },
      { provide: RegisterAuditLogUseCase, useValue: audit },
    ] });
    TestBed.inject(SessionService).startSession(
      { id: 'user1', businessId: '1', fullName: 'User', email: 'user@example.test', role: 'ADMIN', active: true },
      { id: '1', name: 'Business', address: '', phone: '', active: true },
    );
  });

  function expectNoWrites(): void {
    for (const write of [countRepository.create, adjustmentRepository.create,
      requestRepository.create, requestRepository.update, wasteRepository.create,
      batchRepository.updateQuantity, movement.execute, audit.execute]) {
      expect(write).not.toHaveBeenCalled();
    }
  }

  it('allows own batches and rejects other businesses and missing business context', async () => {
    const access = TestBed.inject(BatchAccessService);
    await expect(access.assertAccess('b1')).resolves.toBeUndefined();
    await expect(access.assertAccess('b2')).rejects.toThrow('El lote no pertenece');
    vi.spyOn(TestBed.inject(BusinessContextService), 'belongsToBusiness').mockReturnValue(false);
    await expect(access.assertAccess('b1')).rejects.toThrow('El lote no pertenece');
    expectNoWrites();
  });

  it.each(['b1', 'b2'])('registers physical counts only for own batch: %s', async (batchId) => {
    const operation = TestBed.inject(RegisterPhysicalCountUseCase).execute({
      batchId, countedQuantity: 8, observation: ' Count ',
    });
    if (batchId === 'b2') {
      await expect(operation).rejects.toThrow('El lote no pertenece');
      expectNoWrites();
    } else {
      await expect(operation).resolves.toMatchObject({ systemQuantity: 10, difference: -2, observation: 'Count' });
      expect(batchRepository.updateQuantity).not.toHaveBeenCalled();
    }
  });

  it.each(['c1', 'c2'])('applies stock adjustments only for own count: %s', async (id) => {
    const operation = TestBed.inject(ApplyStockAdjustmentUseCase).execute(id, ' Adjustment ');
    if (id === 'c2') {
      await expect(operation).rejects.toThrow('El lote no pertenece');
      expectNoWrites();
    } else {
      await expect(operation).resolves.toMatchObject({ previousQuantity: 10, newQuantity: 8, difference: -2 });
      expect(movement.execute).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'b1', type: 'OUT', quantity: 2 }));
      expect(audit.execute).toHaveBeenCalled();
    }
  });

  it.each(['c1', 'c2'])('creates correction requests only for own count: %s', async (id) => {
    requestRepository.getAll.mockResolvedValue([]);
    const operation = TestBed.inject(CreateCorrectionRequestUseCase).execute(id, ' Correction ');
    if (id === 'c2') {
      await expect(operation).rejects.toThrow('El lote no pertenece');
      expectNoWrites();
    } else {
      await expect(operation).resolves.toMatchObject({ physicalCountId: 'c1', status: 'PENDING', reason: 'Correction' });
    }
  });

  it.each([
    ['r1', true], ['r1', false], ['r2', true], ['r2', false],
  ] as const)('reviews request %s with approved=%s only for own business', async (id, approved) => {
    const operation = TestBed.inject(ReviewCorrectionRequestUseCase).execute(id, approved, ' Review ');
    if (id === 'r2') {
      await expect(operation).rejects.toThrow('El lote no pertenece');
      expectNoWrites();
    } else {
      await expect(operation).resolves.toMatchObject({ status: approved ? 'APPROVED' : 'REJECTED', reviewComment: 'Review' });
      expect(movement.execute).toHaveBeenCalledTimes(approved ? 1 : 0);
      expect(audit.execute).toHaveBeenCalled();
    }
  });

  it.each(['b1', 'b2'])('registers waste only for own batch: %s', async (batchId) => {
    const operation = TestBed.inject(RegisterWasteUseCase).execute({
      batchId, quantity: 2, reason: 'DAMAGED', observation: ' Broken ',
    });
    if (batchId === 'b2') {
      await expect(operation).rejects.toThrow('El lote no pertenece');
      expectNoWrites();
    } else {
      await expect(operation).resolves.toMatchObject({ batchId: 'b1', quantity: 2, observation: 'Broken' });
      expect(movement.execute).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'b1', type: 'OUT', quantity: 2 }));
      expect(audit.execute).toHaveBeenCalled();
    }
  });

  it('filters counts, adjustments, wastes and correction requests by active business', async () => {
    const records = [{ id: 'own', batchId: 'b1' }, { id: 'other', batchId: 'b2' }, { id: 'orphan', batchId: 'missing' }];
    vi.spyOn(TestBed.inject(StockAdjustmentRepository), 'getAll').mockResolvedValue(records.map((record) => ({
      ...record, physicalCountId: 'c1', previousQuantity: 10, newQuantity: 8, difference: -2,
      reason: 'Adjustment', adjustedAt: '2026-11-04',
    })));
    vi.spyOn(TestBed.inject(WasteRepository), 'getAll').mockResolvedValue(records.map((record) => ({
      ...record, quantity: 2, reason: 'DAMAGED', observation: null, registeredAt: '2026-11-04',
    })));
    expect((await TestBed.inject(GetPhysicalCountsUseCase).execute()).map((item) => item.id)).toEqual(['c1']);
    expect((await TestBed.inject(GetStockAdjustmentsUseCase).execute()).map((item) => item.id)).toEqual(['own']);
    expect((await TestBed.inject(GetWastesUseCase).execute()).map((item) => item.id)).toEqual(['own']);
    const component = TestBed.runInInjectionContext(() => new CorrectionRequestList());
    await component.load();
    expect(component.requests().map((item) => item.id)).toEqual(['r1']);
    expect(component.counts().map((item) => item.id)).toEqual(['c1']);
    expectNoWrites();
  });

  it('preserves duplicate request, stock-change and insufficient-stock rules', async () => {
    await expect(TestBed.inject(CreateCorrectionRequestUseCase).execute('c1', 'Correction')).rejects.toThrow('Ya existe una solicitud pendiente');
    batchRepository.getById.mockResolvedValue({ ...batches[0], availableQuantity: 1 });
    await expect(TestBed.inject(ApplyStockAdjustmentUseCase).execute('c1', 'Adjustment')).rejects.toThrow('El stock cambió');
    await expect(TestBed.inject(RegisterWasteUseCase).execute({
      batchId: 'b1', quantity: 2, reason: 'DAMAGED', observation: null,
    })).rejects.toThrow('La merma supera el stock');
    expectNoWrites();
  });
});
