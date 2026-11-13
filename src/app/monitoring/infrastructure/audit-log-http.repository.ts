import { Injectable, inject } from '@angular/core';

import { AuditLog } from '../domain/model/audit-log.entity';
import { AuditLogRepository, NewAuditLog } from '../domain/audit-log.repository';
import { AuditLogsApiEndpoint } from './audit-logs-api-endpoint';
import { AuditLogAssembler } from './assemblers/audit-log.assembler';

@Injectable()
export class AuditLogHttpRepository extends AuditLogRepository {
  private readonly endpoint = inject(AuditLogsApiEndpoint);

  override async getAll(): Promise<AuditLog[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => AuditLogAssembler.toEntity(response));
  }

  override async create(data: NewAuditLog): Promise<AuditLog> {
    const response = await this.endpoint.create(data);
    return AuditLogAssembler.toEntity(response);
  }
}
