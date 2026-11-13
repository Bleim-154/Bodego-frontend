export interface UserResponse {
  id: string | number;
  businessId: string | number;
  fullName: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
  active: boolean;
}
