import { Injectable, inject } from '@angular/core';

import { PhysicalCount } from '../domain/model/physical-count.entity';
import { PhysicalCountRepository, NewPhysicalCount } from '../domain/physical-count.repository';
import { PhysicalCountsApiEndpoint } from './physical-counts-api-endpoint';
import { PhysicalCountAssembler } from './assemblers/physical-count.assembler';

@Injectable()
export class PhysicalCountHttpRepository extends PhysicalCountRepository {
  private readonly endpoint = inject(PhysicalCountsApiEndpoint);

  override async getAll(): Promise<PhysicalCount[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => PhysicalCountAssembler.toEntity(response));
  }

  override async create(data: NewPhysicalCount): Promise<PhysicalCount> {
    const response = await this.endpoint.create(data);
    return PhysicalCountAssembler.toEntity(response);
  }
}
