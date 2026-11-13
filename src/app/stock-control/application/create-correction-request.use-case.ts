import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { PhysicalCountRepository } from '../domain/physical-count.repository';
import { CorrectionRequestRepository } from '../domain/correction-request.repository';
import { BatchAccessService } from '../../inventory/application/batch-access.service';

@Injectable({ providedIn: 'root' })
export class CreateCorrectionRequestUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly countRepository: PhysicalCountRepository,
    private readonly requestRepository: CorrectionRequestRepository,
    private readonly batchAccess: BatchAccessService,
  ) {}

  async execute(physicalCountId: string, reason: string) {
    const operation = this.operationContext.captureOperation();
    if (!physicalCountId || !reason.trim()) {
      throw new Error('Seleccione un conteo e ingrese el motivo.');
    }

    const [counts, requests] = await Promise.all([
      this.countRepository.getAll(),
      this.requestRepository.getAll(),
    ]);
    operation.assertCurrent();

    const count = counts.find((item) => String(item.id) === String(physicalCountId));

    if (!count) {
      throw new Error('Conteo físico no encontrado.');
    }

    await this.batchAccess.assertAccess(String(count.batchId));
    operation.assertCurrent();

    if (count.difference === 0) {
      throw new Error('El conteo no presenta diferencias.');
    }

    if (
      requests.some(
        (item) =>
          String(item.physicalCountId) === String(physicalCountId) && item.status === 'PENDING',
      )
    ) {
      throw new Error('Ya existe una solicitud pendiente para este conteo.');
    }

    operation.assertCurrent();
    return operation.complete(this.requestRepository.create({
      physicalCountId: String(count.id),
      reason: reason.trim(),
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewComment: null,
    }));
  }
}
