import { AuditLog } from '../../domain/model/audit-log.entity';
import { AuditLogResponse } from '../responses/audit-log.response';

export class AuditLogAssembler {
  static toEntity(response: AuditLogResponse): AuditLog {
    return {
      id: String(response.id),
      // Do not infer ownership for historical records without a business.
      businessId: response.businessId === undefined ? '' : String(response.businessId),
      action: response.action,
      entityType: response.entityType,
      entityId: String(response.entityId),
      description: response.description,
      performedAt: response.performedAt,
      userId: response.userId == null ? null : String(response.userId),
    };
  }
}
