import { Offer } from '../../domain/model/offer.entity';
import { OfferResponse } from '../responses/offer.response';

export class OfferAssembler {
  static toEntity(response: OfferResponse): Offer {
    return {
      id: String(response.id),
      productId: String(response.productId),
      title: response.title,
      discountPercentage: response.discountPercentage,
      startDate: response.startDate,
      endDate: response.endDate,
      active: response.active,
    };
  }
}
