import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { CorrectionRequestRepository } from '../domain/correction-request.repository';
import { ApplyStockAdjustmentUseCase } from './apply-stock-adjustment.use-case';
import { RegisterAuditLogUseCase } from '../../monitoring/application/register-audit-log.use-case';
import { PhysicalCountRepository } from '../domain/physical-count.repository';
import { BatchAccessService } from '../../inventory/application/batch-access.service';

@Injectable({ providedIn: 'root' })
export class ReviewCorrectionRequestUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: CorrectionRequestRepository,
    private readonly applyAdjustment: ApplyStockAdjustmentUseCase,
    private readonly auditLog: RegisterAuditLogUseCase,
    private readonly countRepository: PhysicalCountRepository,
    private readonly batchAccess: BatchAccessService,
  ) {}

  async execute(requestId: string, approved: boolean, comment: string) {
    const operation = this.operationContext.captureOperation();
    operation.assertRole('ADMIN');
    const audit = this.auditLog.forOperation();
    const requests = await this.repository.getAll();
    operation.assertRole('ADMIN');

    const request = requests.find((item) => String(item.id) === String(requestId));

    if (!request) {
      throw new Error('Solicitud no encontrada.');
    }

    if (request.status !== 'PENDING') {
      throw new Error('La solicitud ya fue revisada.');
    }

    const counts = await this.countRepository.getAll();
    operation.assertRole('ADMIN');
    const count = counts.find((item) => String(item.id) === String(request.physicalCountId));

    if (!count) {
      throw new Error('Conteo físico no encontrado.');
    }

    await this.batchAccess.assertAccess(String(count.batchId));
    operation.assertRole('ADMIN');

    if (approved) {
      await this.applyAdjustment.execute(
        String(request.physicalCountId),
        `Solicitud ${request.id}: ${request.reason}`,
      );
    }

    operation.assertRole('ADMIN');
    const updated = await this.repository.update(String(request.id), {
      status: approved ? 'APPROVED' : 'REJECTED',
      reviewedAt: new Date().toISOString(),
      reviewComment: comment.trim() || null,
    });

    await audit.execute({
      action: 'CORRECTION_REVIEWED',
      entityType: 'CorrectionRequest',
      entityId: String(request.id),
      description:
        `Solicitud ${approved ? 'aprobada' : 'rechazada'}. ` +
        `Comentario: ${comment.trim() || 'Sin comentario'}`,
    });

    operation.assertRole('ADMIN');
    return updated;
  }
}
