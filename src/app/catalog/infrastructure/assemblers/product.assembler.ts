import { Product } from '../../domain/model/product.entity';
import { ProductResponse } from '../responses/product.response';

export class ProductAssembler {
  static toEntity(response: ProductResponse): Product {
    return {
      id: String(response.id),
      businessId: String(response.businessId),
      categoryId: String(response.categoryId),
      name: response.name,
      description: response.description,
      price: response.price,
      minimumStock: response.minimumStock,
      active: response.active,
    };
  }
}
