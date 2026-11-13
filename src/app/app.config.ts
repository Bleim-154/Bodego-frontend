import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AuthenticationRepository } from './iam/domain/authentication.repository';
import { AuthenticationHttpRepository } from './iam/infrastructure/authentication-http.repository';
import { authenticationInterceptor } from './iam/infrastructure/authentication.interceptor';
import { routes } from './app.routes';

// Business ports are real and route-scoped. Legacy JSON providers exist only in src/testing.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authenticationInterceptor])),
    { provide: AuthenticationRepository, useClass: AuthenticationHttpRepository },
  ],
};
