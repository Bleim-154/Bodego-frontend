import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-session-navigation',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatSidenav,
    MatSidenavContainer,
    MatSidenavContent,
    MatButton,
    MatIconButton,
    MatIcon,
  ],
  templateUrl: './session-navigation.html',
  styleUrl: './session-navigation.css',
})
export class SessionNavigation {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');

  readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 959px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  readonly menuOpen = signal(false);

  readonly navigation = [
    {
      label: 'General',
      admin: false,
      links: [{ path: '/dashboard', label: 'Panel de control', icon: 'space_dashboard' }],
    },
    {
      label: 'Inventario',
      admin: false,
      links: [
        { path: '/products', label: 'Productos', icon: 'inventory_2' },
        { path: '/categories', label: 'Categorías', icon: 'category' },
        { path: '/batches', label: 'Lotes', icon: 'package_2' },
        { path: '/inventory/movements', label: 'Movimientos', icon: 'swap_vert' },
        { path: '/stock-control/counts', label: 'Conteos físicos', icon: 'fact_check' },
        { path: '/stock-control/adjustments', label: 'Ajustes de stock', icon: 'tune' },
        { path: '/stock-control/correction-requests', label: 'Solicitudes', icon: 'assignment' },
        { path: '/stock-control/wastes', label: 'Mermas', icon: 'delete_outline' },
      ],
    },
    {
      label: 'Control y estrategia',
      admin: true,
      links: [
        { path: '/monitoring/alerts', label: 'Alertas', icon: 'notifications' },
        { path: '/monitoring/audit', label: 'Auditoría', icon: 'history' },
        { path: '/strategic-offers/recommendations', label: 'Recomendaciones', icon: 'lightbulb' },
        { path: '/strategic-offers/offers', label: 'Ofertas', icon: 'sell' },
      ],
    },
    {
      label: 'Administración',
      admin: true,
      links: [
        { path: '/iam/businesses', label: 'Negocios', icon: 'storefront' },
        { path: '/iam/users', label: 'Usuarios', icon: 'group' },
      ],
    },
  ] as const;

  focusContent(): void {
    this.menuOpen.set(false);
    const content = this.content()?.nativeElement;
    content?.focus({ preventScroll: true });
    content?.closest('mat-sidenav-content')?.scrollTo(0, 0);
  }

  logout(): void {
    this.session.endSession();
    void this.router.navigateByUrl('/session');
  }
}
