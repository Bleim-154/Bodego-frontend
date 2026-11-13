export type UserRole = 'ADMIN' | 'EMPLOYEE';

export interface User {
  id: string;
  businessId: string;
  fullName: string;
  email: string;
  role: UserRole;
  active: boolean;
}
