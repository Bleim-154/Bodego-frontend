import { DestroyRef, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { App } from '../../../app';
import { appConfig } from '../../../app.config';
import { environment } from '../../../../environments/environment';
import { SessionService } from '../../application/session.service';

// Real production routes/adapters; all HTTP is intercepted and uses synthetic data.
describe('Protected session view boundary (A03)', () => {
  const base = environment.backendApiUrl;
  const initialRow = 'Protected row before expiry';
  const freshRow = 'Fresh row after login';
  let fixture: ComponentFixture<App>;
  let session: SessionService;
  let router: Router;
  let http: HttpTestingController;
  let marker: string;
  let getCount: number;
  let originalScrollTo: PropertyDescriptor | undefined;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [appConfig.providers, provideHttpClientTesting()],
    }).compileComponents();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
    originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
    marker = initialRow;
    getCount = 0;
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
      vi.useRealTimers();
      if (originalScrollTo)
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    }
  });

  function startSession(businessId = '1', role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN'): void {
    session.startSession(
      { id: '1', businessId, role, fullName: 'Fixture user', email: '', active: true },
      { id: businessId, name: 'Fixture business', address: '', phone: '', active: true },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 1_000 },
    );
  }

  function responseFor(path: string, businessId = Number(session.currentBusiness()?.id ?? 1)) {
    const date = '2026-11-12T12:00:00Z';
    const responses: Record<string, unknown> = {
      '/products': [
        {
          id: 7,
          businessId,
          categoryId: 3,
          name: marker,
          description: null,
          price: 1,
          minimumStock: 5,
          active: true,
        },
      ],
      '/categories': [{ id: 3, businessId, name: marker, description: null }],
      '/lots': [
        {
          id: 10,
          businessId,
          productId: 7,
          batchNumber: marker,
          quantity: 2,
          expirationDate: null,
        },
      ],
      '/inventory-movements': [
        {
          id: 20,
          businessId,
          lotId: 10,
          type: 'ENTRY',
          quantity: 1,
          reason: marker,
          createdAt: date,
        },
      ],
      '/physical-counts': [
        {
          id: 21,
          businessId,
          lotId: 10,
          systemQuantity: 2,
          countedQuantity: 1,
          difference: -1,
          observation: marker,
          countedAt: date,
        },
      ],
      '/stock-adjustments': [
        {
          id: 22,
          businessId,
          lotId: 10,
          physicalCountId: 21,
          previousQuantity: 2,
          newQuantity: 1,
          difference: -1,
          reason: marker,
          adjustedAt: date,
        },
      ],
      '/correction-requests': [
        {
          id: 23,
          businessId,
          physicalCountId: 21,
          reason: marker,
          status: 'PENDING',
          requestedAt: date,
          reviewedAt: null,
          reviewComment: null,
        },
      ],
      '/wastes': [
        {
          id: 24,
          businessId,
          lotId: 10,
          quantity: 1,
          reason: 'OTHER',
          observation: marker,
          registeredAt: date,
          inventoryMovementId: 20,
        },
      ],
      '/alerts': [
        {
          id: 25,
          businessId,
          productId: 7,
          lotId: null,
          type: 'LOW_STOCK',
          severity: 'MEDIUM',
          message: marker,
          generatedAt: date,
          resolved: false,
          resolvedAt: null,
        },
      ],
      '/audit-logs': [
        {
          id: 26,
          businessId,
          userId: 1,
          action: 'FIXTURE_ACTION',
          entityType: 'Product',
          entityId: 7,
          description: marker,
          occurredAt: date,
        },
      ],
      '/recommendations': [
        {
          id: 27,
          businessId,
          productId: 7,
          lotId: 10,
          type: 'EXPIRING',
          message: marker,
          generatedAt: date,
          dismissed: false,
        },
      ],
      '/offers': [
        {
          id: 28,
          businessId,
          productId: 7,
          title: marker,
          discountPercentage: 10,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          active: true,
        },
      ],
      '/iam/users': {
        items: [
          {
            id: 1,
            businessId,
            fullName: marker,
            email: 'fixture@example.invalid',
            role: 'ADMIN',
            active: true,
          },
        ],
        page: 0,
        size: 20,
        hasNext: false,
      },
    };
    expect(responses[path]).toBeDefined();
    return responses[path] as object;
  }

  async function settle(flush = true): Promise<void> {
    // Router, HttpClient and application promises, without advancing the expiry timer.
    for (let i = 0; i < 60; i++) {
      fixture.detectChanges();
      if (flush) {
        for (const request of http.match(() => true)) {
          expect(request.request.method).toBe('GET');
          expect(request.request.url.startsWith(base + '/')).toBe(true);
          request.flush(responseFor(request.request.url.slice(base.length)));
          getCount++;
        }
      }
      await Promise.resolve();
    }
    fixture.detectChanges();
  }

  async function mount(path = '/products', authenticated = true, flush = true): Promise<void> {
    if (authenticated) startSession();
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await router.navigateByUrl(path);
    await settle(flush);
  }

  function outlet(): RouterOutlet {
    return fixture.debugElement.query(By.directive(RouterOutlet)).injector.get(RouterOutlet);
  }

  function trackDestroy(): {
    destroyed: ReturnType<typeof vi.fn>;
    host: HTMLElement;
    component: object;
  } {
    const component = outlet().component;
    const view = fixture.debugElement.query(By.directive(component.constructor as Type<unknown>));
    const destroyed = vi.fn();
    view.injector.get(DestroyRef).onDestroy(destroyed);
    return { destroyed, host: view.nativeElement, component };
  }

  it.each([
    '/dashboard',
    '/products',
    '/categories',
    '/batches',
    '/inventory/movements',
    '/stock-control/counts',
    '/stock-control/adjustments',
    '/stock-control/correction-requests',
    '/stock-control/wastes',
    '/monitoring/alerts',
    '/monitoring/audit',
    '/strategic-offers/recommendations',
    '/strategic-offers/offers',
    '/iam/users',
    '/iam/businesses',
  ])(
    'destroys the real %s view on automatic expiry even if navigation cannot complete',
    async (path) => {
      await mount(path);
      const loaded = outlet().component as { loading?: () => boolean; error?: () => string };
      if (loaded.loading) expect(loaded.loading()).toBe(false);
      if (loaded.error) expect(loaded.error()).toBe('');
      const view = trackDestroy();
      const navigate = vi
        .spyOn(router, 'navigateByUrl')
        .mockImplementation(() => new Promise(() => {}));
      vi.advanceTimersByTime(1_000);
      fixture.detectChanges();
      expect(view.destroyed).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.contains(view.host)).toBe(false);
      await settle();
      expect(session.currentUser()).toBeNull();
      expect(session.getAccessToken()).toBeNull();
      expect(view.destroyed).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.contains(view.host)).toBe(false);
      expect(fixture.nativeElement.textContent).not.toContain(initialRow);
      expect(outlet().isActivated).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/session', { replaceUrl: true });
      if (path !== '/iam/businesses') expect(getCount).toBeGreaterThan(0);
    },
  );

  it('removes populated rows on explicit invalidation before redirect finishes', async () => {
    await mount();
    expect(fixture.nativeElement.textContent).toContain(initialRow);
    const view = trackDestroy();
    vi.spyOn(router, 'navigateByUrl').mockImplementation(() => new Promise(() => {}));
    session.endSession();
    fixture.detectChanges();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).not.toContain(initialRow);
    await settle();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).not.toContain(initialRow);
  });

  it('manual logout removes the mounted view and reaches the public login', async () => {
    await mount();
    const view = trackDestroy();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((item) =>
      (item as HTMLElement).textContent?.includes('Cerrar sesión'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();
    button.click();
    await settle();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(router.url).toBe('/session');
    expect(fixture.nativeElement.textContent).not.toContain(initialRow);
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('automatic expiry reaches login without another HTTP request and public login survives unauthenticated invalidation', async () => {
    await mount();
    const count = getCount;
    vi.advanceTimersByTime(1_000);
    await settle();
    expect(router.url).toBe('/session');
    expect(getCount).toBe(count);
    const login = outlet().component;
    session.endSession();
    await settle();
    expect(outlet().component === login).toBe(true);
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('creates a fresh view after logout/login in the same business without rendering cached rows', async () => {
    await mount();
    const view = trackDestroy();
    session.endSession();
    await settle();
    marker = freshRow;
    startSession();
    await router.navigateByUrl('/products');
    await settle();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(outlet().component === view.component).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(freshRow);
    expect(fixture.nativeElement.textContent).not.toContain(initialRow);
  });

  it('discards unsaved form state on expiry and recreates an empty form in the same business', async () => {
    await mount('/products/new');
    const view = trackDestroy();
    const name = fixture.nativeElement.querySelector('#name') as HTMLInputElement;
    name.value = 'Unsaved protected draft';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(name.value).toBe('Unsaved protected draft');
    vi.advanceTimersByTime(1_000);
    await settle();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('#name')).toBeNull();
    startSession();
    await router.navigateByUrl('/products/new');
    await settle();
    expect(outlet().component === view.component).toBe(false);
    expect((fixture.nativeElement.querySelector('#name') as HTMLInputElement).value).toBe('');
  });

  it('the previous expiry timer cannot remove a newer session view', async () => {
    await mount();
    vi.advanceTimersByTime(500);
    marker = freshRow;
    startSession();
    await settle();
    vi.advanceTimersByTime(500);
    await settle();
    expect(session.hasAuthenticatedSession()).toBe(true);
    expect(router.url).toBe('/products');
    expect(fixture.nativeElement.textContent).toContain(freshRow);
    vi.advanceTimersByTime(500);
    await settle();
    expect(router.url).toBe('/session');
    expect(fixture.nativeElement.textContent).not.toContain(freshRow);
  });

  it.each(['1', '2'])(
    'replaces the mounted view even without an intermediate render (new business %s)',
    async (business) => {
      await mount();
      const view = trackDestroy();
      marker = freshRow;
      session.endSession();
      startSession(business);
      await settle();
      expect(view.destroyed).toHaveBeenCalledOnce();
      expect(router.url).toBe('/products');
      expect(outlet().component === view.component).toBe(false);
      expect(fixture.nativeElement.textContent).toContain(freshRow);
      expect(fixture.nativeElement.textContent).not.toContain(initialRow);
      expect(session.currentBusiness()?.id).toBe(business);
    },
  );

  it('direct replacement by EMPLOYEE destroys the ADMIN view and preserves role guards', async () => {
    await mount('/monitoring/audit');
    const view = trackDestroy();
    startSession('1', 'EMPLOYEE');
    await settle();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(router.url).toBe('/products');
    await router.navigateByUrl('/monitoring/audit');
    await settle();
    expect(router.url).toBe('/products');
    http.expectNone(base + '/audit-logs');
  });

  it('a late successful response cannot repopulate a destroyed view or the replacement session', async () => {
    await mount('/products', true, false);
    const oldRequest = http.expectOne(base + '/products');
    const oldBody = responseFor('/products');
    const view = trackDestroy();
    marker = freshRow;
    startSession();
    await settle();
    oldRequest.flush(oldBody);
    await settle();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain(freshRow);
    expect(fixture.nativeElement.textContent).not.toContain(initialRow);
    expect(session.hasAuthenticatedSession()).toBe(true);
  });

  it('a late successful response after expiry cannot bring protected data back to login', async () => {
    await mount('/products', true, false);
    const oldRequest = http.expectOne(base + '/products');
    const oldBody = responseFor('/products');
    const view = trackDestroy();
    vi.advanceTimersByTime(1_000);
    await settle();
    oldRequest.flush(oldBody);
    await settle();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(router.url).toBe('/session');
    expect(fixture.nativeElement.textContent).not.toContain(initialRow);
    expect(session.hasAuthenticatedSession()).toBe(false);
  });

  it('a late 401 cannot end a replacement session or remove its new view', async () => {
    await mount();
    const pending = firstValueFrom(TestBed.inject(HttpClient).get(base + '/products'));
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    const oldRequest = http.expectOne(base + '/products');
    marker = freshRow;
    startSession();
    await settle();
    const replacement = outlet().component;
    oldRequest.flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    await settle();
    expect(session.hasAuthenticatedSession()).toBe(true);
    expect(outlet().component === replacement).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(freshRow);
  });

  it('a current 401 destroys protected content and returns to login', async () => {
    await mount();
    const view = trackDestroy();
    const pending = firstValueFrom(TestBed.inject(HttpClient).get(base + '/products'));
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    http.expectOne(base + '/products').flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    await settle();
    expect(view.destroyed).toHaveBeenCalledOnce();
    expect(router.url).toBe('/session');
    expect(fixture.nativeElement.textContent).not.toContain(initialRow);
  });

  it('still denies protected navigation without a JWT and exposes only the public login', async () => {
    await mount('/products', false);
    expect(router.url).toBe('/session');
    expect(fixture.nativeElement.querySelector('app-product-list')).toBeNull();
    http.expectNone(() => true);
  });
});
