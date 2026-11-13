export interface Offer {
  id: string;
  productId: string;
  title: string;
  discountPercentage: number;
  startDate: string;
  endDate: string;
  active: boolean;
}
