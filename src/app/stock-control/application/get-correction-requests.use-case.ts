import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { CorrectionRequestRepository } from '../domain/correction-request.repository';
import { CorrectionRequest } from '../domain/model/correction-request.entity';
import { PhysicalCount } from '../domain/model/physical-count.entity';
import { GetPhysicalCountsUseCase } from './get-physical-counts.use-case';

export interface CorrectionRequestsWithCounts {
  readonly requests: CorrectionRequest[];
  readonly counts: PhysicalCount[];
}

@Injectable({ providedIn: 'root' })
export class GetCorrectionRequestsUseCase {
  private readonly operationContext = inject(BusinessContextService);
  private readonly getCounts = inject(GetPhysicalCountsUseCase);

  constructor(private readonly repository: CorrectionRequestRepository) {}

  execute(): Promise<CorrectionRequest[]> {
    const operation = this.operationContext.captureOperation();
    return operation.complete(this.executeWithCounts().then(result => result.requests));
  }

  /** Share the same authorized counts with consumers that also need the creation options. */
  async executeWithCounts(): Promise<CorrectionRequestsWithCounts> {
    const operation = this.operationContext.captureOperation();
    const [requests, counts] = await Promise.all([
      this.repository.getAll(),
      this.getCounts.execute(),
    ]);
    operation.assertCurrent();

    const allowedCountIds = new Set(counts.map(count => String(count.id)));
    return {
      requests: requests.filter(request => allowedCountIds.has(String(request.physicalCountId))),
      counts,
    };
  }
}
