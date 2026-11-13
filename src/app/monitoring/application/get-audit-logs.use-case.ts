import { Injectable } from '@angular/core';

import { AuditLogRepository } from '../domain/audit-log.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';

@Injectable({ providedIn: 'root' })
export class GetAuditLogsUseCase {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly businessContext: BusinessContextService,
  ) {}

  async execute() {
    const operation = this.businessContext.captureOperation();
    const businessId = operation.businessId;
    const logs = await this.repository.getAll();
    operation.assertCurrent();
    return logs.filter((log) => String(log.businessId) === businessId);
  }
}
