import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Product } from '../../../catalog/domain/model/product.entity';
import { GetProductsUseCase } from '../../../catalog/application/get-products.use-case';
import { Offer } from '../../domain/model/offer.entity';
import { ManageOffersUseCase } from '../../application/manage-offers.use-case';

@Component({
  selector: 'app-offer-management',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './offer-management.html',
  styleUrl: './offer-management.css',
})
export class OfferManagement implements OnInit {
  private readonly manageOffers = inject(ManageOffersUseCase);
  private readonly getProducts = inject(GetProductsUseCase);

  readonly offers = signal<Offer[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  editingId: string | null = null;

  productId = '';
  title = '';
  discountPercentage = 10;
  startDate = '';
  endDate = '';

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const [offers, products] = await Promise.all([
        this.manageOffers.getAll(),
        this.getProducts.execute(),
      ]);

      this.offers.set(offers);
      this.products.set(products);
    } catch {
      this.error.set('No se pudieron cargar las ofertas.');
    } finally {
      this.loading.set(false);
    }
  }

  productName(id: string): string {
    return this.products().find((item) => String(item.id) === String(id))?.name ?? id;
  }

  edit(offer: Offer): void {
    this.editingId = String(offer.id);
    this.productId = String(offer.productId);
    this.title = offer.title;
    this.discountPercentage = offer.discountPercentage;
    this.startDate = offer.startDate;
    this.endDate = offer.endDate;
    this.error.set('');
    this.message.set('');
  }

  reset(): void {
    this.editingId = null;
    this.productId = '';
    this.title = '';
    this.discountPercentage = 10;
    this.startDate = '';
    this.endDate = '';
  }

  async save(): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      const data = {
        productId: this.productId,
        title: this.title,
        discountPercentage: this.discountPercentage,
        startDate: this.startDate,
        endDate: this.endDate,
      };

      if (this.editingId) {
        await this.manageOffers.update(this.editingId, data);
      } else {
        await this.manageOffers.create({
          ...data,
          active: true,
        });
      }

      this.reset();
      await this.load();
      this.message.set('Oferta guardada correctamente.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al guardar.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleStatus(offer: Offer): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.manageOffers.changeStatus(String(offer.id), !offer.active);

      await this.load();
      this.message.set('Estado actualizado.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al actualizar.');
    } finally {
      this.saving.set(false);
    }
  }
}
