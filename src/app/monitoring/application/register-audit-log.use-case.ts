import { Injectable } from '@angular/core';

import { AuditLogRepository } from '../domain/audit-log.repository';

import { AuditAction, AuditLog } from '../domain/model/audit-log.entity';
import { SessionService } from '../../iam/application/session.service';
import { BusinessContextService } from '../../iam/application/business-context.service';

export interface RegisterAuditLogCommand {
  action: AuditAction;
  entityType: string;
  entityId: string;
  description: string;
  userId?: string | null;
}

export interface OperationAuditLog {
  readonly execute: (command: RegisterAuditLogCommand) => Promise<AuditLog>;
}

@Injectable({ providedIn: 'root' })
export class RegisterAuditLogUseCase {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly session: SessionService,
    private readonly businessContext: BusinessContextService,
  ) {}

  /** No caller-supplied identity: bind the writer synchronously to the current session. */
  forOperation(): OperationAuditLog {
    const { businessId, userId } = this.session.captureOperation();
    return Object.freeze({
      execute: (command: RegisterAuditLogCommand) => this.record(command, businessId, userId),
    });
  }

  execute(command: RegisterAuditLogCommand) {
    return this.record(command, this.businessContext.requireBusinessId(), this.session.currentUser()?.id ?? null);
  }

  private record(command: RegisterAuditLogCommand, businessId: string, userId: string | null) {
    return this.repository.create({
      action: command.action,
      entityType: command.entityType,
      entityId: String(command.entityId),
      description: command.description,
      performedAt: new Date().toISOString(),
      businessId,
      userId,
    });
  }
}
