import { Category } from '../../domain/model/category.entity';
import { CategoryResponse } from '../responses/category.response';

export class CategoryAssembler {
  static toEntity(response: CategoryResponse): Category {
    return {
      id: String(response.id),
      name: response.name,
      description: response.description,
    };
  }
}
