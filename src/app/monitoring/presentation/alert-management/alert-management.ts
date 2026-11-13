import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { InventoryAlert } from '../../domain/model/alert.entity';
import { GetAlertsUseCase } from '../../application/get-alerts.use-case';
import { GenerateAlertsUseCase } from '../../application/generate-alerts.use-case';
import { ResolveAlertUseCase } from '../../application/resolve-alert.use-case';

@Component({
  selector: 'app-alert-management',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './alert-management.html',
  styleUrl: './alert-management.css',
})
export class AlertManagement implements OnInit {
  private readonly getAlerts = inject(GetAlertsUseCase);
  private readonly generateAlerts = inject(GenerateAlertsUseCase);
  private readonly resolveAlert = inject(ResolveAlertUseCase);

  readonly alerts = signal<InventoryAlert[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  readonly showResolved = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const alerts = await this.getAlerts.execute();

      this.alerts.set(
        [...alerts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      );
    } catch {
      this.error.set('No se pudieron cargar las alertas.');
    } finally {
      this.loading.set(false);
    }
  }

  visibleAlerts(): InventoryAlert[] {
    return this.alerts().filter((alert) => this.showResolved() || !alert.resolved);
  }

  async generate(): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      const created = await this.generateAlerts.execute();

      await this.load();

      this.message.set(`${created} alertas nuevas generadas.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al generar alertas.');
    } finally {
      this.saving.set(false);
    }
  }

  async resolve(id: string): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.resolveAlert.execute(id);
      await this.load();

      this.message.set('Alerta marcada como atendida.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al atender alerta.');
    } finally {
      this.saving.set(false);
    }
  }
}
