import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Batch } from '../../domain/model/batch.entity';
import { GetBatchesUseCase } from '../../application/get-batches.use-case';

import { Product } from '../../../catalog/domain/model/product.entity';
import { GetProductsUseCase } from '../../../catalog/application/get-products.use-case';
import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-batch-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './batch-list.html',
  styleUrl: './batch-list.css',
})
export class BatchList implements OnInit {
  readonly session = inject(SessionService);
  private readonly getBatchesUseCase = inject(GetBatchesUseCase);
  private readonly getProductsUseCase = inject(GetProductsUseCase);

  readonly batches = signal<Batch[]>([]);
  readonly products = signal<Product[]>([]);

  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const [batches, products] = await Promise.all([
        this.getBatchesUseCase.execute(),
        this.getProductsUseCase.execute(),
      ]);

      this.batches.set(batches);
      this.products.set(products);
    } catch (error) {
      this.error.set('No se pudo cargar la información del inventario.');
    } finally {
      this.loading.set(false);
    }
  }

  getProductName(productId: string): string {
    const product = this.products().find((product) => product.id === productId);

    return product?.name ?? 'Producto no encontrado';
  }

  formatDate(date: string | null): string {
    if (!date) {
      return 'No aplica';
    }

    const [year, month, day] = date.split('-');

    return `${day}/${month}/${year}`;
  }
}
