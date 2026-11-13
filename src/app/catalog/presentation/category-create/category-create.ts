import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CreateCategoryUseCase } from '../../application/create-category.use-case';

@Component({
  selector: 'app-category-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './category-create.html',
  styleUrl: './category-create.css',
})
export class CategoryCreate {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  private readonly createCategoryUseCase = inject(CreateCategoryUseCase);

  readonly saving = signal(false);
  readonly error = signal('');

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      const values = this.form.getRawValue();

      await this.createCategoryUseCase.execute({
        name: values.name,
        description: values.description || null,
      });

      await this.router.navigate(['/categories']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo registrar la categoría.');
    } finally {
      this.saving.set(false);
    }
  }
}
