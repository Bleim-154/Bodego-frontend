export interface ProductData {
  categoryId: string;
  name: string;
  price: number;
  minimumStock: number;
}

export class ProductValidator {
  static validate(data: ProductData): void {
    if (!data.name.trim()) {
      throw new Error('El nombre del producto es obligatorio.');
    }

    if (data.name.trim().length > 100) {
      throw new Error('El nombre no puede superar los 100 caracteres.');
    }

    if (!data.categoryId.trim()) {
      throw new Error('Debe seleccionar una categoría válida.');
    }

    if (!Number.isFinite(data.price) || data.price <= 0) {
      throw new Error('El precio debe ser mayor que cero.');
    }

    if (!Number.isInteger(data.minimumStock) || data.minimumStock < 0) {
      throw new Error('El stock mínimo debe ser un número entero no negativo.');
    }
  }
}
