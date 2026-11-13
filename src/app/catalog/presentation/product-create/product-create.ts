import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Category } from '../../domain/model/category.entity';
import { GetCategoriesUseCase } from '../../application/get-categories.use-case';
import { CreateProductUseCase } from '../../application/create-product.use-case';
import { BusinessContextService } from '../../../iam/application/business-context.service';

@Component({
  selector: 'app-product-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './product-create.html',
  styleUrl: './product-create.css',
})
export class ProductCreate implements OnInit {
  private readonly businessContext = inject(BusinessContextService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  private readonly getCategoriesUseCase = inject(GetCategoriesUseCase);
  private readonly createProductUseCase = inject(CreateProductUseCase);

  readonly categories = signal<Category[]>([]);
  readonly loadingCategories = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
    categoryId: ['', [Validators.required]],
    price: [0, [Validators.required, Validators.min(0.01)]],
    minimumStock: [0, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  ngOnInit(): void {
    void this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    this.loadingCategories.set(true);
    this.error.set('');

    try {
      const categories = await this.getCategoriesUseCase.execute();
      this.categories.set(categories);
    } catch (error) {
      this.error.set('No se pudieron cargar las categorías.');
    } finally {
      this.loadingCategories.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      const values = this.form.getRawValue();

      await this.createProductUseCase.execute({
        businessId: this.businessContext.requireBusinessId(),
        categoryId: values.categoryId,
        name: values.name,
        description: values.description || null,
        price: values.price,
        minimumStock: values.minimumStock,
        active: values.active,
      });

      await this.router.navigate(['/products']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo registrar el producto.');
    } finally {
      this.saving.set(false);
    }
  }
}
