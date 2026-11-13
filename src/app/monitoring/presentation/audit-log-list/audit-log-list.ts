import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuditLog } from '../../domain/model/audit-log.entity';
import { GetAuditLogsUseCase } from '../../application/get-audit-logs.use-case';

@Component({
  selector: 'app-audit-log-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './audit-log-list.html',
  styleUrl: './audit-log-list.css',
})
export class AuditLogList implements OnInit {
  private readonly getLogs = inject(GetAuditLogsUseCase);

  readonly logs = signal<AuditLog[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly filter = signal('');

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const logs = await this.getLogs.execute();

      this.logs.set(
        [...logs].sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt)),
      );
    } catch {
      this.error.set('No se pudieron cargar los registros.');
    } finally {
      this.loading.set(false);
    }
  }

  filteredLogs(): AuditLog[] {
    const search = this.filter().toLowerCase();

    return this.logs().filter(
      (log) =>
        log.action.toLowerCase().includes(search) ||
        log.description.toLowerCase().includes(search) ||
        log.entityType.toLowerCase().includes(search),
    );
  }
}
