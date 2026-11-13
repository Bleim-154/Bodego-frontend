import { inject, Injectable } from '@angular/core';
import { BusinessContextService } from '../../iam/application/business-context.service';
import { AlertRepository } from '../domain/alert.repository';
import { AuditLogRepository } from '../domain/audit-log.repository';
import { AlertGenerationPort } from '../domain/alert-generation.port';

async function authorized<T>(
  context: BusinessContextService,
  action: () => Promise<T>,
  admin = false,
): Promise<T> {
  const operation = context.captureOperation();
  if (admin) operation.assertRole('ADMIN');
  else if (operation.role !== 'ADMIN' && operation.role !== 'EMPLOYEE')
    throw new Error('No tiene permisos.');
  return operation.complete(action());
}

@Injectable()
export class GetBackendAlertsUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(AlertRepository);
  execute() {
    return authorized(this.context, () => this.repository.getAll());
  }
}
@Injectable()
export class GenerateBackendAlertsUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly generation = inject(AlertGenerationPort);
  async execute(): Promise<number> {
    return (await authorized(this.context, () => this.generation.generate(), true)).length;
  }
}
@Injectable()
export class ResolveBackendAlertUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(AlertRepository);
  execute(id: string) {
    return authorized(this.context, () => this.repository.markResolved(id), true);
  }
}
@Injectable()
export class GetBackendAuditLogsUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(AuditLogRepository);
  execute() {
    return authorized(this.context, () => this.repository.getAll(), true);
  }
}
