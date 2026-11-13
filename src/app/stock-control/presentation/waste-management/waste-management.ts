import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Batch } from '../../../inventory/domain/model/batch.entity';
import { GetBatchesUseCase } from '../../../inventory/application/get-batches.use-case';

import { Waste, WasteReason } from '../../domain/model/waste.entity';
import { GetWastesUseCase } from '../../application/get-wastes.use-case';
import { RegisterWasteUseCase } from '../../application/register-waste.use-case';

@Component({
  selector: 'app-waste-management',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './waste-management.html',
  styleUrl: './waste-management.css',
})
export class WasteManagement implements OnInit {
  private readonly getBatches = inject(GetBatchesUseCase);
  private readonly getWastes = inject(GetWastesUseCase);
  private readonly registerWaste = inject(RegisterWasteUseCase);

  readonly batches = signal<Batch[]>([]);
  readonly wastes = signal<Waste[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  batchId = '';
  quantity = 1;
  reason: WasteReason = 'EXPIRED';
  observation = '';

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const [batches, wastes] = await Promise.all([
        this.getBatches.execute(),
        this.getWastes.execute(),
      ]);

      this.batches.set(batches);
      this.wastes.set(
        [...wastes].sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt)),
      );
    } catch {
      this.error.set('No se pudieron cargar los datos.');
    } finally {
      this.loading.set(false);
    }
  }

  getBatchCode(id: string): string {
    return this.batches().find((batch) => String(batch.id) === String(id))?.code || id;
  }

  async submit(): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.registerWaste.execute({
        batchId: this.batchId,
        quantity: this.quantity,
        reason: this.reason,
        observation: this.observation || null,
      });

      this.batchId = '';
      this.quantity = 1;
      this.reason = 'EXPIRED';
      this.observation = '';

      await this.load();

      this.message.set('Merma registrada correctamente.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al registrar merma.');
    } finally {
      this.saving.set(false);
    }
  }
}
