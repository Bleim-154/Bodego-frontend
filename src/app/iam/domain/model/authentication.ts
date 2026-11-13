import { UserRole } from './user.entity';

export interface AccessToken {
  accessToken: string;
  expiresIn: number;
}

export interface AuthenticatedIdentity {
  userId: string;
  businessId: string;
  role: UserRole;
}
