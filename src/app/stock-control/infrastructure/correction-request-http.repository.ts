import { Injectable, inject } from '@angular/core';

import { CorrectionRequest } from '../domain/model/correction-request.entity';
import { CorrectionRequestRepository, NewCorrectionRequest } from '../domain/correction-request.repository';
import { CorrectionRequestsApiEndpoint } from './correction-requests-api-endpoint';
import { CorrectionRequestAssembler } from './assemblers/correction-request.assembler';

@Injectable()
export class CorrectionRequestHttpRepository extends CorrectionRequestRepository {
  private readonly endpoint = inject(CorrectionRequestsApiEndpoint);

  override async getAll(): Promise<CorrectionRequest[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => CorrectionRequestAssembler.toEntity(response));
  }

  override async create(data: NewCorrectionRequest): Promise<CorrectionRequest> {
    const response = await this.endpoint.create(data);
    return CorrectionRequestAssembler.toEntity(response);
  }

  override async update(id: string, changes: Partial<CorrectionRequest>): Promise<CorrectionRequest> {
    const response = await this.endpoint.update(id, changes);
    return CorrectionRequestAssembler.toEntity(response);
  }
}
