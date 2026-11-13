import { Component, inject, signal, computed, effect, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { User } from '../../domain/model/user.entity';
import { SessionService } from '../../application/session.service';
import {
  ManageUserDirectoryUseCase,
  CreateEmployeeUseCase,
} from '../../application/manage-user-directory.use-case';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css',
})
export class UserManagement implements OnInit, OnDestroy {
  readonly session = inject(SessionService);
  private readonly directory = inject(ManageUserDirectoryUseCase);
  private readonly creation = inject(CreateEmployeeUseCase);
  private readonly view = signal<Awaited<ReturnType<ManageUserDirectoryUseCase['getPage']>> | null>(
    null,
  );
  private readonly detail = signal<User | null>(null);
  private request = 0;
  readonly currentPage = computed(() => {
    const user = this.session.currentUser();
    const business = this.session.currentBusiness();
    const page = this.view();
    return user?.role === 'ADMIN' &&
      business &&
      page &&
      page.businessId === String(business.id) &&
      page.sessionVersion === this.session.version
      ? page
      : null;
  });
  readonly selected = computed(() => (this.currentPage() ? this.detail() : null));
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  fullName = '';
  email = '';
  password = '';
  private identityVersion = this.session.version;
  constructor() {
    effect(() => {
      this.session.currentUser();
      this.session.currentBusiness();
      if (this.identityVersion === this.session.version) return;
      this.identityVersion = this.session.version;
      this.request++;
      this.fullName = '';
      this.email = '';
      this.password = '';
      this.view.set(null);
      this.detail.set(null);
      this.error.set('');
      this.message.set('');
      this.loading.set(false);
      this.saving.set(false);
    });
  }
  ngOnInit() {
    void this.load();
  }
  ngOnDestroy() {
    this.request++;
    this.password = '';
    this.view.set(null);
    this.detail.set(null);
  }
  async load(page = 0) {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.view.set(null);
    this.detail.set(null);
    try {
      const result = await this.directory.getPage(page);
      if (request === this.request && result.sessionVersion === this.session.version)
        this.view.set(result);
    } catch (error) {
      if (request === this.request)
        this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el directorio.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  async show(id: string) {
    if (this.saving() || this.loading()) return;
    const version = this.session.version;
    this.saving.set(true);
    this.error.set('');
    this.detail.set(null);
    try {
      const user = await this.directory.getById(id);
      if (version === this.session.version) this.detail.set(user);
    } catch (error) {
      if (version === this.session.version)
        this.error.set(error instanceof Error ? error.message : 'No se pudo consultar el usuario.');
    } finally {
      if (version === this.session.version) this.saving.set(false);
    }
  }
  async save() {
    if (this.saving() || this.loading()) return;
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    const version = this.session.version;
    try {
      const pending = this.creation.execute({
        fullName: this.fullName,
        email: this.email,
        password: this.password,
      });
      this.password = '';
      await pending;
      if (version !== this.session.version) return;
      this.fullName = '';
      this.email = '';
      await this.load();
      if (version === this.session.version) this.message.set('Empleado creado.');
    } catch (error) {
      if (version === this.session.version)
        this.error.set(error instanceof Error ? error.message : 'No se pudo crear el empleado.');
    } finally {
      if (version === this.session.version) {
        this.password = '';
        this.saving.set(false);
      }
    }
  }
  async toggleStatus(user: User) {
    if (this.saving() || this.loading() || user.role !== 'EMPLOYEE') return;
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    const page = this.currentPage()?.page ?? 0;
    const version = this.session.version;
    try {
      await this.directory.changeStatus(user.id, !user.active);
      if (version !== this.session.version) return;
      await this.load(page);
      if (version === this.session.version) this.message.set('Estado del empleado actualizado.');
    } catch (error) {
      if (version === this.session.version)
        this.error.set(error instanceof Error ? error.message : 'No se pudo cambiar el estado.');
    } finally {
      if (version === this.session.version) this.saving.set(false);
    }
  }
}
