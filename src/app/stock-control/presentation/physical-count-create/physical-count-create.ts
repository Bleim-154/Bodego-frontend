import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Batch } from '../../../inventory/domain/model/batch.entity';
import { GetBatchesUseCase } from '../../../inventory/application/get-batches.use-case';
import { RegisterPhysicalCountUseCase } from '../../application/register-physical-count.use-case';

@Component({
  selector: 'app-physical-count-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './physical-count-create.html',
  styleUrl: './physical-count-create.css',
})
export class PhysicalCountCreate implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly getBatches = inject(GetBatchesUseCase);
  private readonly registerCount = inject(RegisterPhysicalCountUseCase);

  readonly batches = signal<Batch[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    batchId: ['', Validators.required],
    countedQuantity: [
      0,
      [
        Validators.required,
        Validators.min(0),
        Validators.max(2_147_483_647),
        Validators.pattern(/^\d+$/),
      ],
    ],
    observation: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    void this.loadBatches();
  }

  async loadBatches(): Promise<void> {
    try {
      this.batches.set(await this.getBatches.execute());
    } catch {
      this.error.set('No se pudieron cargar los lotes.');
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set('');

    try {
      const values = this.form.getRawValue();

      await this.registerCount.execute({
        batchId: values.batchId,
        countedQuantity: values.countedQuantity,
        observation: values.observation || null,
      });

      await this.router.navigate(['/stock-control/counts']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al registrar conteo.');
    } finally {
      this.saving.set(false);
    }
  }
}
