export interface OfferResponse {
  id: string | number;
  productId: string | number;
  title: string;
  discountPercentage: number;
  startDate: string;
  endDate: string;
  active: boolean;
}
