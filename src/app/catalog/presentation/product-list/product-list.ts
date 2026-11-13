import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Product } from '../../domain/model/product.entity';
import { GetProductsUseCase } from '../../application/get-products.use-case';
import { ChangeProductStatusUseCase } from '../../application/change-product-status.use-case';
import { BusinessContextService } from '../../../iam/application/business-context.service';
import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-list.html',
  styleUrl: './product-list.css',
})
export class ProductList implements OnInit {
  readonly session = inject(SessionService);
  readonly businessContext = inject(BusinessContextService);
  private readonly getProductsUseCase = inject(GetProductsUseCase);
  private readonly changeProductStatusUseCase = inject(ChangeProductStatusUseCase);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly updatingProductId = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadProducts();
  }

  async loadProducts(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const products = await this.getProductsUseCase.execute();
      this.products.set(products);
    } catch (error) {
      this.error.set('No se pudieron cargar los productos.');
    } finally {
      this.loading.set(false);
    }
  }
  async toggleProductStatus(product: Product): Promise<void> {
    if (!this.session.isAdmin()) {
      this.error.set('No tiene permisos para esta operación.');
      return;
    }
    if (this.updatingProductId() !== null) {
      return;
    }

    const newStatus = !product.active;

    const action = newStatus ? 'activar' : 'desactivar';

    const confirmed = window.confirm(
      `¿Está seguro de que desea ${action} el producto "${product.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    this.updatingProductId.set(product.id);
    this.error.set('');

    try {
      const updatedProduct = await this.changeProductStatusUseCase.execute({
        id: product.id,
        active: newStatus,
      });

      this.products.update((products) =>
        products.map((currentProduct) =>
          currentProduct.id === updatedProduct.id ? updatedProduct : currentProduct,
        ),
      );
    } catch (error) {
      this.error.set('No se pudo actualizar el estado del producto.');
    } finally {
      this.updatingProductId.set(null);
    }
  }
}
