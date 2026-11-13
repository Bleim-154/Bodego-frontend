import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Batch } from '../../domain/model/batch.entity';
import { GetBatchesUseCase } from '../../application/get-batches.use-case';
import { RegisterInventoryMovementUseCase } from '../../application/register-inventory-movement.use-case';
import { MovementType } from '../../domain/model/inventory-movement.entity';

@Component({
  selector: 'app-movement-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './movement-create.html',
  styleUrl: './movement-create.css',
})
export class MovementCreate implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly getBatches = inject(GetBatchesUseCase);
  private readonly registerMovement = inject(RegisterInventoryMovementUseCase);

  readonly batches = signal<Batch[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    batchId: ['', Validators.required],
    type: ['IN' as MovementType, Validators.required],
    quantity: [
      1,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(2_147_483_647),
        Validators.pattern(/^[1-9][0-9]*$/),
      ],
    ],
    reason: ['', [Validators.required, Validators.maxLength(255)]],
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
      await this.registerMovement.execute(this.form.getRawValue());

      await this.router.navigate(['/batches']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al guardar.');
    } finally {
      this.saving.set(false);
    }
  }
}
