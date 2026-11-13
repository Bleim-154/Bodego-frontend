import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CorrectionRequest } from '../../domain/model/correction-request.entity';
import { PhysicalCount } from '../../domain/model/physical-count.entity';

import { GetCorrectionRequestsUseCase } from '../../application/get-correction-requests.use-case';
import { CreateCorrectionRequestUseCase } from '../../application/create-correction-request.use-case';
import { ReviewCorrectionRequestUseCase } from '../../application/review-correction-request.use-case';
import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-correction-request-list',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './correction-request-list.html',
  styleUrl: './correction-request-list.css',
})
export class CorrectionRequestList implements OnInit {
  readonly session = inject(SessionService);
  private readonly getRequests = inject(GetCorrectionRequestsUseCase);
  private readonly createRequest = inject(CreateCorrectionRequestUseCase);
  private readonly reviewRequest = inject(ReviewCorrectionRequestUseCase);

  readonly requests = signal<CorrectionRequest[]>([]);
  readonly counts = signal<PhysicalCount[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  selectedCountId = '';
  reason = '';
  reviewComment = '';

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const { requests, counts } = await this.getRequests.executeWithCounts();

      this.requests.set(requests);
      this.counts.set(counts);
    } catch {
      this.error.set('No se pudieron cargar los datos.');
    } finally {
      this.loading.set(false);
    }
  }

  async submitRequest(): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.createRequest.execute(this.selectedCountId, this.reason);

      this.selectedCountId = '';
      this.reason = '';
      this.message.set('Solicitud registrada correctamente.');

      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al registrar.');
    } finally {
      this.saving.set(false);
    }
  }

  async review(id: string, approved: boolean): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.reviewRequest.execute(String(id), approved, this.reviewComment);

      this.reviewComment = '';
      this.message.set(approved ? 'Solicitud aprobada.' : 'Solicitud rechazada.');

      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al revisar.');
    } finally {
      this.saving.set(false);
    }
  }
}
