import { Offer } from './model/offer.entity';

export type NewOffer = Omit<Offer, 'id'>;

export type OfferChanges = Pick<
  Offer,
  'productId' | 'title' | 'discountPercentage' | 'startDate' | 'endDate'
>;

export abstract class OfferRepository {
  abstract getAll(): Promise<Offer[]>;
  abstract getById(id: string): Promise<Offer>;
  abstract create(data: NewOffer): Promise<Offer>;
  abstract update(id: string, changes: OfferChanges): Promise<Offer>;
  abstract changeStatus(id: string, active: boolean): Promise<Offer>;
}
