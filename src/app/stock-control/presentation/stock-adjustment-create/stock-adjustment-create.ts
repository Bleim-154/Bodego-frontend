import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { PhysicalCount } from '../../domain/model/physical-count.entity';
import { GetPhysicalCountsUseCase } from '../../application/get-physical-counts.use-case';
import { ApplyStockAdjustmentUseCase } from '../../application/apply-stock-adjustment.use-case';
import { GetStockAdjustmentsUseCase } from '../../application/get-stock-adjustments.use-case';
import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-stock-adjustment-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './stock-adjustment-create.html',
  styleUrl: './stock-adjustment-create.css',
})
export class StockAdjustmentCreate implements OnInit {
  readonly session = inject(SessionService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly getCounts = inject(GetPhysicalCountsUseCase);
  private readonly getAdjustments = inject(GetStockAdjustmentsUseCase);
  private readonly applyAdjustment = inject(ApplyStockAdjustmentUseCase);

  readonly counts = signal<PhysicalCount[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    physicalCountId: ['', Validators.required],
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    void this.loadCounts();
  }

  async loadCounts(): Promise<void> {
    try {
      const [counts, adjustments] = await Promise.all([
        this.getCounts.execute(),
        this.getAdjustments.execute(),
      ]);

      const adjustedIds = new Set(adjustments.map((item) => String(item.physicalCountId)));

      this.counts.set(
        counts.filter((item) => item.difference !== 0 && !adjustedIds.has(String(item.id))),
      );
    } catch {
      this.error.set('No se pudieron cargar los conteos.');
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set('');

    try {
      const values = this.form.getRawValue();

      await this.applyAdjustment.execute(values.physicalCountId, values.reason);

      await this.router.navigate(['/stock-control/adjustments']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al aplicar ajuste.');
    } finally {
      this.saving.set(false);
    }
  }
}
