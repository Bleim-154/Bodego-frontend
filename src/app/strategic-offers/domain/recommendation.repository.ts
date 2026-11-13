import { Recommendation } from './model/recommendation.entity';

export type NewRecommendation = Omit<Recommendation, 'id'>;

export abstract class RecommendationRepository {
  abstract getAll(): Promise<Recommendation[]>;
  abstract create(data: NewRecommendation): Promise<Recommendation>;
  abstract dismiss(id: string): Promise<Recommendation>;
}
