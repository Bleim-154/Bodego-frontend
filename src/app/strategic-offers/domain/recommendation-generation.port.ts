import { Recommendation } from './model/recommendation.entity';
export abstract class RecommendationGenerationPort {
  abstract generate(): Promise<Recommendation[]>;
}
