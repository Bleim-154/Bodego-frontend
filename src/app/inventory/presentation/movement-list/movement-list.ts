import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { InventoryMovement } from '../../domain/model/inventory-movement.entity';
import { GetInventoryMovementsUseCase } from '../../application/get-inventory-movements.use-case';

@Component({
  selector: 'app-movement-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './movement-list.html',
  styleUrl: './movement-list.css',
})
export class MovementList implements OnInit {
  private readonly getMovements = inject(GetInventoryMovementsUseCase);

  readonly movements = signal<InventoryMovement[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    void this.loadMovements();
  }

  async loadMovements(): Promise<void> {
    this.loading.set(true);

    try {
      const movements = await this.getMovements.execute();

      this.movements.set(
        [...movements].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      );
    } catch {
      this.error.set('No se pudieron cargar los movimientos.');
    } finally {
      this.loading.set(false);
    }
  }
}
