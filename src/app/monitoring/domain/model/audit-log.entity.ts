// The backend exposes bounded text, not a closed enum. Keep each recorded action verbatim.
export type AuditAction = string;

export interface AuditLog {
  id: string;
  businessId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  description: string;
  performedAt: string;
  userId: string | null;
}
