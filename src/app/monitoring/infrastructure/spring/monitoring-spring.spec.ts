import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../../testing/legacy-app.config';
import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { SessionService } from '../../../iam/application/session.service';
import { roleGuard } from '../../../iam/application/role.guard';
import { AlertRepository } from '../../domain/alert.repository';
import { AlertGenerationPort } from '../../domain/alert-generation.port';
import { AuditLogRepository } from '../../domain/audit-log.repository';
import { GetAlertsUseCase } from '../../application/get-alerts.use-case';
import { GetAuditLogsUseCase } from '../../application/get-audit-logs.use-case';
import { GenerateAlertsUseCase } from '../../application/generate-alerts.use-case';
import { ResolveAlertUseCase } from '../../application/resolve-alert.use-case';
import { RegisterAuditLogUseCase } from '../../application/register-audit-log.use-case';
import { REAL_MONITORING_PROVIDERS } from './monitoring-route.providers';
import { SpringAlertHttpRepository } from './spring-alert-http.repository';
import { SpringAuditLogHttpRepository } from './spring-audit-log-http.repository';
import { alertFromBackend, auditFromBackend } from './monitoring-backend.contract';

describe('Monitoring real boundary (mock HTTP only)', () => {
  const base = environment.backendApiUrl;
  const date = '2026-11-12T12:00:00Z';
  const resolvedDate = '2026-11-12T13:00:00Z';
  const alert = {
    id: 20,
    businessId: 1,
    productId: 7,
    lotId: 10,
    type: 'EXPIRING_SOON',
    severity: 'MEDIUM',
    message: 'Fixture',
    resolved: false,
    generatedAt: date,
    resolvedAt: null,
    createdAt: '2026-11-12T12:00:01Z',
  };
  const audit = {
    id: 30,
    businessId: 1,
    userId: 9,
    action: 'INVENTORY_MOVEMENT_CREATED',
    entityType: 'InventoryMovement',
    entityId: 40,
    description: 'Fixture',
    occurredAt: date,
    createdAt: '2026-11-12T12:00:01Z',
  };
  let scope: EnvironmentInjector;
  let session: SessionService;
  let http: HttpTestingController;
  let router: Router;
  let alerts: AlertRepository;
  let audits: AuditLogRepository;
  function login(role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN', businessId = '1') {
    session.startSession(
      { id: '1', businessId, role, fullName: 'Fixture', email: '', active: true },
      { id: businessId, name: 'Fixture', address: '', phone: '', active: true },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60_000 },
    );
  }
  function request(method: string, path: string) {
    const req = http.expectOne(base + path);
    expect(req.request.method).toBe(method);
    expect(req.request.headers.get('Authorization')).toBe('Bearer fixture.payload.signature');
    expect(req.request.withCredentials).toBe(false);
    return req;
  }
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    login();
    scope = createEnvironmentInjector(
      REAL_MONITORING_PROVIDERS,
      TestBed.inject(EnvironmentInjector),
    );
    alerts = scope.get(AlertRepository);
    audits = scope.get(AuditLogRepository);
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      scope.destroy();
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
    }
  });

  it('scopes both Monitoring routes and keeps pending modules on the JSON root graph', () => {
    for (const path of ['monitoring/alerts', 'monitoring/audit'])
      expect(routes.find((r) => r.path === path)?.providers).toBe(REAL_MONITORING_PROVIDERS);
    expect(alerts).toBeInstanceOf(SpringAlertHttpRepository);
    expect(audits).toBeInstanceOf(SpringAuditLogHttpRepository);
    expect(TestBed.inject(AlertRepository)).not.toBeInstanceOf(SpringAlertHttpRepository);
    expect(TestBed.inject(AuditLogRepository)).not.toBeInstanceOf(SpringAuditLogHttpRepository);
    for (const path of ['iam/users'])
      expect(routes.find((r) => r.path === path)?.providers).toBeDefined();
  });
  it.each(['ADMIN', 'EMPLOYEE'] as const)(
    'preserves backend alert reading policy for %s without JSON joins',
    async (role) => {
      login(role);
      const result = scope.get(GetAlertsUseCase).execute();
      request('GET', '/alerts').flush([alert]);
      expect((await result)[0]).toMatchObject({
        id: '20',
        productId: '7',
        batchId: '10',
        type: 'EXPIRING_SOON',
        severity: 'MEDIUM',
        createdAt: date,
        resolvedAt: null,
      });
      http.expectNone(() => true);
    },
  );
  it.each(['LOW', 'MEDIUM', 'HIGH'])(
    'retains server severity %s without collapsing information',
    (severity) => {
      expect(alertFromBackend({ ...alert, severity }, '1').severity).toBe(severity);
    },
  );
  it.each(['LOW_STOCK', 'EXPIRING_SOON', 'EXPIRED'])('retains server alert type %s', (type) => {
    expect(
      alertFromBackend({ ...alert, type, lotId: type === 'LOW_STOCK' ? null : 10 }, '1').type,
    ).toBe(type);
  });
  it('generates exclusively on the backend and counts only returned new alerts', async () => {
    const result = scope.get(GenerateAlertsUseCase).execute();
    const req = request('POST', '/alerts/generate');
    expect(req.request.body).toEqual({ businessId: 1 });
    req.flush([alert]);
    expect(await result).toBe(1);
    http.expectNone(() => true);
    const repeated = scope.get(GenerateAlertsUseCase).execute();
    request('POST', '/alerts/generate').flush([]);
    expect(await repeated).toBe(0);
    http.expectNone(() => true);
  });
  it('resolves with a bodyless PATCH and accepts idempotent server timestamps', async () => {
    for (let index = 0; index < 2; index++) {
      const result = scope.get(ResolveAlertUseCase).execute('20');
      const req = request('PATCH', '/alerts/20/resolve');
      expect(req.request.body).toBeNull();
      req.flush({ ...alert, resolved: true, resolvedAt: resolvedDate });
      expect((await result).resolvedAt).toBe(resolvedDate);
      http.expectNone(() => true);
    }
  });
  it('reads original audit actors, arbitrary actions and occurredAt without identity substitution', async () => {
    const result = scope.get(GetAuditLogsUseCase).execute();
    request('GET', '/audit-logs').flush([
      audit,
      { ...audit, id: 31, userId: null, action: 'HISTORICAL_CUSTOM_ACTION' },
    ]);
    const rows = await result;
    expect(rows[0]).toEqual({
      id: '30',
      businessId: '1',
      userId: '9',
      action: audit.action,
      entityType: audit.entityType,
      entityId: '40',
      description: 'Fixture',
      performedAt: date,
    });
    expect(rows[1].userId).toBeNull();
    expect(rows[1].action).toBe('HISTORICAL_CUSTOM_ACTION');
    http.expectNone(() => true);
  });
  it('checks ADMIN in application before invoking ports', async () => {
    login('EMPLOYEE');
    const generate = vi.spyOn(scope.get(AlertGenerationPort), 'generate');
    const resolve = vi.spyOn(alerts, 'markResolved');
    const read = vi.spyOn(audits, 'getAll');
    await expect(scope.get(GenerateAlertsUseCase).execute()).rejects.toThrow();
    await expect(scope.get(ResolveAlertUseCase).execute('20')).rejects.toThrow();
    await expect(scope.get(GetAuditLogsUseCase).execute()).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });
  it('also rejects administrative direct transport use for EMPLOYEE', async () => {
    login('EMPLOYEE');
    await expect(audits.getAll()).rejects.toThrow();
    await expect(alerts.markResolved('20')).rejects.toThrow();
    await expect(scope.get(AlertGenerationPort).generate()).rejects.toThrow();
    http.expectNone(() => true);
  });
  it('blocks browser audit and generic alert creation without HTTP', async () => {
    await expect(alerts.create({} as never)).rejects.toThrow('backend');
    await expect(audits.create({} as never)).rejects.toThrow('solo lectura');
    await expect(
      scope.get(RegisterAuditLogUseCase).execute({
        action: 'Fixture',
        entityType: 'Alert',
        entityId: '20',
        description: 'Fixture',
      }),
    ).rejects.toThrow('solo lectura');
    http.expectNone(() => true);
  });
  it.each(['0', 'mock/20', '9007199254740992', '20?businessId=2'])(
    'rejects unsafe ID %s before transport',
    async (id) => {
      await expect(alerts.markResolved(id)).rejects.toThrow('identificador');
      http.expectNone(() => true);
    },
  );
  it.each(['alerts', 'audit', 'generation'] as const)(
    'rejects foreign business data from %s',
    async (kind) => {
      const pending = (
        kind === 'alerts'
          ? alerts.getAll()
          : kind === 'audit'
            ? audits.getAll()
            : scope.get(AlertGenerationPort).generate()
      ).catch((error) => error);
      request(
        kind === 'generation' ? 'POST' : 'GET',
        kind === 'alerts' ? '/alerts' : kind === 'audit' ? '/audit-logs' : '/alerts/generate',
      ).flush([{ ...(kind === 'audit' ? audit : alert), businessId: 2 }]);
      expect(await pending).toBeInstanceOf(Error);
    },
  );
  it('rejects mismatched resolution IDs and malformed server records', async () => {
    const result = alerts.markResolved('20').catch((error) => error);
    request('PATCH', '/alerts/20/resolve').flush({
      ...alert,
      id: 99,
      resolved: true,
      resolvedAt: resolvedDate,
    });
    expect(await result).toBeInstanceOf(Error);
    expect(() => alertFromBackend({ ...alert, severity: 'WARNING' }, '1')).toThrow();
    expect(() => alertFromBackend({ ...alert, resolved: true }, '1')).toThrow();
    expect(() => auditFromBackend({ ...audit, userId: 'mock-user' }, '1')).toThrow();
    expect(() => auditFromBackend({ ...audit, occurredAt: '2026-11-12' }, '1')).toThrow();
  });
  it.each([400, 403, 404, 409, 500])('sanitizes %s without write retries', async (status) => {
    const result = alerts.markResolved('20').catch((error) => error as Error);
    request('PATCH', '/alerts/20/resolve').flush(
      { message: 'PRIVATE_INTERNAL_FIXTURE' },
      { status, statusText: 'Fixture' },
    );
    expect(((await result) as Error).message).not.toContain('PRIVATE_INTERNAL_FIXTURE');
    http.expectNone(() => true);
  });
  it('warns about uncertain writes after network failure', async () => {
    const result = scope
      .get(GenerateAlertsUseCase)
      .execute()
      .catch((error) => error as Error);
    request('POST', '/alerts/generate').error(new ProgressEvent('error'));
    expect(((await result) as Error).message).toContain('antes de reintentar');
    http.expectNone(() => true);
  });
  it('invalidates the current session on 401', async () => {
    const result = audits.getAll().catch((error) => error);
    request('GET', '/audit-logs').flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(session.hasAuthenticatedSession()).toBe(false);
  });
  it('discards late data and preserves a replacement session on late 401', async () => {
    const result = audits.getAll().catch((error) => error);
    const req = request('GET', '/audit-logs');
    login('ADMIN', '2');
    req.flush([audit]);
    expect(await result).toBeInstanceOf(Error);
    const late = alerts.getAll().catch((error) => error);
    const old = request('GET', '/alerts');
    login('ADMIN', '3');
    old.flush({}, { status: 401, statusText: 'Unauthorized' });
    await late;
    expect(session.hasAuthenticatedSession()).toBe(true);
    expect(session.currentBusiness()?.id).toBe('3');
  });
  it.each(['ADMIN', 'EMPLOYEE'] as const)(
    'preserves current ADMIN-only screen guards for %s',
    (role) => {
      login(role);
      for (const path of ['monitoring/alerts', 'monitoring/audit']) {
        const snapshot = new ActivatedRouteSnapshot();
        snapshot.data = routes.find((r) => r.path === path)!.data!;
        const result = TestBed.runInInjectionContext(() =>
          roleGuard(snapshot, router.routerState.snapshot),
        );
        if (role === 'ADMIN') expect(result).toBe(true);
        else expect(result).toBeInstanceOf(UrlTree);
      }
    },
  );
  it.each(['alerts', 'audit'])(
    'loads the actual %s screen without JSON joins or automatic generation',
    async (kind) => {
      vi.mocked(router.navigateByUrl).mockRestore();
      const pending = RouterTestingHarness.create('/monitoring/' + kind);
      let req: ReturnType<HttpTestingController['expectOne']> | undefined;
      await vi.waitFor(() => {
        req = request('GET', kind === 'alerts' ? '/alerts' : '/audit-logs');
      });
      req!.flush([kind === 'alerts' ? alert : audit]);
      const harness = await pending;
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(harness.routeNativeElement!.textContent).toContain(
          kind === 'alerts' ? 'EXPIRING_SOON' : audit.action,
        );
      });
      expect(harness.routeDebugElement!.injector.get(AlertRepository)).toBeInstanceOf(
        SpringAlertHttpRepository,
      );
      if (kind === 'audit') expect(harness.routeNativeElement!.textContent).toContain('9');
      http.expectNone(() => true);
    },
  );
});
