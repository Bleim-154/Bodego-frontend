import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GetCategoryByIdUseCase } from '../../application/get-category-by-id.use-case';
import { UpdateCategoryUseCase } from '../../application/update-category.use-case';

@Component({
  selector: 'app-category-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './category-edit.html',
  styleUrl: './category-edit.css',
})
export class CategoryEdit implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly getCategoryByIdUseCase = inject(GetCategoryByIdUseCase);
  private readonly updateCategoryUseCase = inject(UpdateCategoryUseCase);

  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  private categoryId = '';

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.error.set('No se encontró el identificador de la categoría.');
      return;
    }

    this.categoryId = id;

    void this.loadCategory();
  }

  async loadCategory(): Promise<void> {
    this.loading.set(true);
    this.loaded.set(false);
    this.error.set('');

    try {
      const category = await this.getCategoryByIdUseCase.execute(this.categoryId);

      this.form.patchValue({
        name: category.name,
        description: category.description ?? '',
      });

      this.loaded.set(true);
    } catch (error) {
      this.error.set('No se pudo cargar la información de la categoría.');
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.loaded() || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      const values = this.form.getRawValue();

      await this.updateCategoryUseCase.execute({
        id: this.categoryId,
        name: values.name,
        description: values.description || null,
      });

      await this.router.navigate(['/categories']);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'No se pudo actualizar la categoría.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
