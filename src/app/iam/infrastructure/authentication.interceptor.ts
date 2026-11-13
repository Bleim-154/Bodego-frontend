import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionService } from '../application/session.service';

export const authenticationInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const base = new URL(environment.backendApiUrl);
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return next(request);
  }
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(`${base.pathname}/`) ||
    url.username ||
    url.password ||
    url.pathname === `${base.pathname}/auth/login`
  ) {
    return next(request);
  }
  const token = session.getAccessToken();
  const version = session.version;
  const authorized =
    token && !request.headers.has('Authorization')
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;
  return next(authorized).pipe(
    catchError((error) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        token !== null &&
        authorized.headers.get('Authorization') === `Bearer ${token}` &&
        session.version === version
      ) {
        session.endSession();
        void router.navigateByUrl('/session');
      }
      return throwError(() => error);
    }),
  );
};
