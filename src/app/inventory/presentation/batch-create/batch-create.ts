import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Product } from '../../../catalog/domain/model/product.entity';
import { GetProductsUseCase } from '../../../catalog/application/get-products.use-case';
import { CreateBatchUseCase } from '../../application/create-batch.use-case';

@Component({
  selector: 'app-batch-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './batch-create.html',
  styleUrl: './batch-create.css',
})
export class BatchCreate implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly getProducts = inject(GetProductsUseCase);
  private readonly createBatch = inject(CreateBatchUseCase);

  readonly products = signal<Product[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    productId: ['', Validators.required],
    code: ['', [Validators.required, Validators.maxLength(100)]],
    expirationDate: [''],
  });

  ngOnInit(): void {
    void this.loadProducts();
  }

  async loadProducts(): Promise<void> {
    try {
      const products = await this.getProducts.execute();
      this.products.set(products.filter((product) => product.active));
    } catch {
      this.error.set('No se pudieron cargar los productos.');
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set('');

    try {
      const values = this.form.getRawValue();

      await this.createBatch.execute({
        ...values,
        entryDate: '',
        expirationDate: values.expirationDate || null,
      });

      await this.router.navigate(['/batches']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al registrar lote.');
    } finally {
      this.saving.set(false);
    }
  }
}
