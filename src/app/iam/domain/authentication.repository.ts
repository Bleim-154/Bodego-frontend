import { AccessToken, AuthenticatedIdentity } from './model/authentication';

export abstract class AuthenticationRepository {
  abstract login(email: string, password: string): Promise<AccessToken>;
  abstract me(accessToken: string): Promise<AuthenticatedIdentity>;
}
