import { AuditLog } from './model/audit-log.entity';

export type NewAuditLog = Omit<AuditLog, 'id'>;

export abstract class AuditLogRepository {
  abstract getAll(): Promise<AuditLog[]>;
  abstract create(log: NewAuditLog): Promise<AuditLog>;
}
