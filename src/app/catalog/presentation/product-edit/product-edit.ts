import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Category } from '../../domain/model/category.entity';
import { GetCategoriesUseCase } from '../../application/get-categories.use-case';
import { GetProductByIdUseCase } from '../../application/get-product-by-id.use-case';
import { UpdateProductUseCase } from '../../application/update-product.use-case';

@Component({
  selector: 'app-product-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './product-edit.html',
  styleUrl: './product-edit.css',
})
export class ProductEdit implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  private readonly getCategoriesUseCase = inject(GetCategoriesUseCase);
  private readonly getProductByIdUseCase = inject(GetProductByIdUseCase);
  private readonly updateProductUseCase = inject(UpdateProductUseCase);
  private productActive = true;

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  productId = '';
  private businessId = 1;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
    categoryId: ['', [Validators.required]],
    price: [0, [Validators.required, Validators.min(0.01)]],
    minimumStock: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.error.set('No se encontró el identificador del producto.');
      return;
    }

    this.productId = id;
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const [categories, product] = await Promise.all([
        this.getCategoriesUseCase.execute(),
        this.getProductByIdUseCase.execute(this.productId),
      ]);

      this.form.patchValue({
        name: product.name,
        description: product.description ?? '',
        categoryId: product.categoryId,
        price: product.price,
        minimumStock: product.minimumStock,
      });
    } catch (error) {
      this.error.set('No se pudo cargar la información del producto.');
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving() || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      const values = this.form.getRawValue();

      await this.updateProductUseCase.execute({
        id: this.productId,
        categoryId: values.categoryId,
        name: values.name,
        description: values.description || null,
        price: values.price,
        minimumStock: values.minimumStock,
      });

      await this.router.navigate(['/products']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el producto.');
    } finally {
      this.saving.set(false);
    }
  }
}
