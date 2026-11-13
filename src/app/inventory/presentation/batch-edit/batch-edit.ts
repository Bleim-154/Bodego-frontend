import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BatchRepository } from '../../domain/batch.repository';
import { Batch } from '../../domain/model/batch.entity';
import { UpdateBatchMetadataUseCase } from '../../application/update-batch-metadata.use-case';

@Component({
  selector: 'app-batch-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './batch-edit.html',
  styleUrl: '../batch-create/batch-create.css',
})
export class BatchEdit implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly batches = inject(BatchRepository);
  private readonly update = inject(UpdateBatchMetadataUseCase);
  private readonly fb = inject(FormBuilder);
  readonly batch = signal<Batch | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(100)]],
    expirationDate: [''],
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const batch = await this.batches.getById(this.route.snapshot.paramMap.get('id') ?? '');
      this.batch.set(batch);
      this.form.patchValue({ code: batch.code, expirationDate: batch.expirationDate ?? '' });
    } catch {
      this.error.set('No se pudo cargar el lote.');
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    const batch = this.batch();
    if (!batch || this.form.invalid || this.loading() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const values = this.form.getRawValue();
      await this.update.execute(batch.id, {
        code: values.code,
        expirationDate: values.expirationDate || null,
      });
      await this.router.navigate(['/batches']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el lote.');
    } finally {
      this.saving.set(false);
    }
  }
}
