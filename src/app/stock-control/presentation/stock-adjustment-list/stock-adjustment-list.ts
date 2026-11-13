import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StockAdjustment } from '../../domain/model/stock-adjustment.entity';
import { GetStockAdjustmentsUseCase } from '../../application/get-stock-adjustments.use-case';
import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-stock-adjustment-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './stock-adjustment-list.html',
  styleUrl: './stock-adjustment-list.css',
})
export class StockAdjustmentList implements OnInit {
  readonly session = inject(SessionService);
  private readonly getAdjustments = inject(GetStockAdjustmentsUseCase);

  readonly adjustments = signal<StockAdjustment[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    void this.loadAdjustments();
  }

  async loadAdjustments(): Promise<void> {
    this.loading.set(true);

    try {
      const data = await this.getAdjustments.execute();

      this.adjustments.set(
        [...data].sort((a, b) => Date.parse(b.adjustedAt) - Date.parse(a.adjustedAt)),
      );
    } catch {
      this.error.set('No se pudieron cargar los ajustes.');
    } finally {
      this.loading.set(false);
    }
  }
}
