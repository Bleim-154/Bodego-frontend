import { CorrectionRequest } from './model/correction-request.entity';

export type NewCorrectionRequest = Omit<CorrectionRequest, 'id'>;

export abstract class CorrectionRequestRepository {
  abstract getAll(): Promise<CorrectionRequest[]>;

  abstract create(request: NewCorrectionRequest): Promise<CorrectionRequest>;

  abstract update(id: string, changes: Partial<CorrectionRequest>): Promise<CorrectionRequest>;
}
