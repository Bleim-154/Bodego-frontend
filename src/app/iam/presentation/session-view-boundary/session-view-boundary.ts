import { Directive, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { SessionService } from '../../application/session.service';
import { User } from '../../domain/model/user.entity';

/** Destroy protected route state when its owning session ends or is replaced. */
@Directive({ selector: 'router-outlet[appSessionViewBoundary]' })
export class SessionViewBoundary {
  private readonly outlet = inject(RouterOutlet, { self: true });
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  // undefined means public/inactive; null means an unauthenticated protected activation.
  // startSession snapshots identity, so even the same user/business has a new owner.
  private readonly owner = signal<Readonly<User> | null | undefined>(undefined);

  constructor() {
    this.outlet.activateEvents.pipe(takeUntilDestroyed()).subscribe(() => {
      this.owner.set(
        this.outlet.activatedRouteData['public'] === true ? undefined : this.session.currentUser(),
      );
    });
    this.outlet.deactivateEvents.pipe(takeUntilDestroyed()).subscribe(() => {
      this.owner.set(undefined);
    });
    effect(() => {
      const owner = this.owner();
      const current = this.session.currentUser();
      if (owner !== undefined && (owner !== current || !this.session.hasAuthenticatedSession())) {
        untracked(() => {
          // Destroy before awaiting navigation: hidden/cached instances must not survive.
          this.outlet.deactivate();
          void this.router.navigateByUrl('/session', { replaceUrl: true });
        });
      }
    });
  }
}
