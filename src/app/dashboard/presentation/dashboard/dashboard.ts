import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GetDashboardUseCase } from '../../application/get-dashboard.use-case';
import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly getDashboard = inject(GetDashboardUseCase);
  readonly session = inject(SessionService);
  private readonly view = signal<Awaited<ReturnType<GetDashboardUseCase['execute']>> | null>(null);
  private request = 0;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = computed(() => {
    const user = this.session.currentUser();
    const business = this.session.currentBusiness();
    const view = this.view();
    return user &&
      business &&
      view &&
      view.businessId === String(business.id) &&
      view.sessionVersion === this.session.version
      ? view.summary
      : null;
  });
  ngOnInit(): void {
    void this.load();
  }
  ngOnDestroy(): void {
    this.request++;
    this.view.set(null);
  }
  async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.view.set(null);
    try {
      const view = await this.getDashboard.execute();
      if (request === this.request && view.sessionVersion === this.session.version)
        this.view.set(view);
    } catch (error) {
      if (request === this.request)
        this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el dashboard.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
