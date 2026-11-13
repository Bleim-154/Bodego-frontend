import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PhysicalCount } from '../../domain/model/physical-count.entity';
import { GetPhysicalCountsUseCase } from '../../application/get-physical-counts.use-case';
import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-physical-count-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './physical-count-list.html',
  styleUrl: './physical-count-list.css',
})
export class PhysicalCountList implements OnInit {
  readonly session = inject(SessionService);
  private readonly getCounts = inject(GetPhysicalCountsUseCase);

  readonly counts = signal<PhysicalCount[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    void this.loadCounts();
  }

  async loadCounts(): Promise<void> {
    this.loading.set(true);

    try {
      const counts = await this.getCounts.execute();

      this.counts.set(
        [...counts].sort((a, b) => Date.parse(b.countedAt) - Date.parse(a.countedAt)),
      );
    } catch {
      this.error.set('No se pudieron cargar los conteos.');
    } finally {
      this.loading.set(false);
    }
  }
}
