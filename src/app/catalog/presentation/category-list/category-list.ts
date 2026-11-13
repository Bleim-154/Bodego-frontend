import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Category } from '../../domain/model/category.entity';
import { GetCategoriesUseCase } from '../../application/get-categories.use-case';
import { SessionService } from '../../../iam/application/session.service';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './category-list.html',
  styleUrl: './category-list.css',
})
export class CategoryList implements OnInit {
  readonly session = inject(SessionService);
  private readonly getCategoriesUseCase = inject(GetCategoriesUseCase);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    void this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const categories = await this.getCategoriesUseCase.execute();

      this.categories.set(categories);
    } catch (error) {
      this.error.set('No se pudieron cargar las categorías.');
    } finally {
      this.loading.set(false);
    }
  }
}
