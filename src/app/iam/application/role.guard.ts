import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';
import { UserRole } from '../domain/model/user.entity';

export const roleGuard: CanActivateFn = (route) => {
  const session = inject(SessionService);
  const router = inject(Router);

  const user = session.currentUser();

  if (!session.hasAuthenticatedSession() || !user) {
    return router.createUrlTree(['/session']);
  }

  const allowedRoles = route.data['roles'] as UserRole[] | undefined;

  if (!allowedRoles || allowedRoles.includes(user.role)) {
    return true;
  }

  return router.createUrlTree(['/products']);
};
