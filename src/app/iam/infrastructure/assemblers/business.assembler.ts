import { Business } from '../../domain/model/business.entity';
import { BusinessResponse } from '../responses/business.response';

export class BusinessAssembler {
  static toEntity(response: BusinessResponse): Business {
    return {
      id: String(response.id),
      name: response.name,
      address: response.address,
      phone: response.phone,
      active: response.active,
    };
  }
}
