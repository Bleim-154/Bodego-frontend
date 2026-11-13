export interface CategoryData {
  name: string;
}

export class CategoryValidator {
  static validate(data: CategoryData): void {
    if (!data.name.trim()) {
      throw new Error('El nombre de la categoría es obligatorio.');
    }

    if (data.name.trim().length > 100) {
      throw new Error('El nombre no puede superar los 100 caracteres.');
    }
  }
}
