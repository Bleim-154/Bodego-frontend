import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AuthenticationService,
  AuthenticationError,
} from '../../application/authentication.service';
import { SessionService } from '../../application/session.service';

@Component({
  selector: 'app-session-selector',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './session-selector.html',
  styleUrl: './session-selector.css',
})
export class SessionSelector implements OnInit {
  private readonly authentication = inject(AuthenticationService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal('');
  email = '';
  password = '';

  ngOnInit(): void {
    if (this.session.hasAuthenticatedSession()) void this.router.navigateByUrl('/products');
  }

  async start(): Promise<void> {
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    const password = this.password;
    this.password = '';
    try {
      await this.authentication.login(this.email, password);
      void this.router.navigateByUrl('/products');
    } catch (error) {
      this.error.set(
        error instanceof AuthenticationError ? error.message : 'No se pudo iniciar sesión.',
      );
    } finally {
      this.password = '';
      this.loading.set(false);
    }
  }
}
