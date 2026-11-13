import { Injectable, inject } from '@angular/core';

import { Business } from '../domain/model/business.entity';
import { BusinessRepository, NewBusiness, BusinessChanges } from '../domain/business.repository';
import { BusinessesApiEndpoint } from './businesses-api-endpoint';
import { BusinessAssembler } from './assemblers/business.assembler';

@Injectable()
export class BusinessHttpRepository extends BusinessRepository {
  private readonly endpoint = inject(BusinessesApiEndpoint);

  override async getAll(): Promise<Business[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => BusinessAssembler.toEntity(response));
  }

  override async getById(id: string): Promise<Business> {
    const response = await this.endpoint.getById(id);
    return BusinessAssembler.toEntity(response);
  }

  override async create(data: NewBusiness): Promise<Business> {
    const response = await this.endpoint.create(data);
    return BusinessAssembler.toEntity(response);
  }

  override async update(id: string, changes: BusinessChanges): Promise<Business> {
    const response = await this.endpoint.update(id, changes);
    return BusinessAssembler.toEntity(response);
  }

  override async changeStatus(id: string, active: boolean): Promise<Business> {
    const response = await this.endpoint.update(id, { active });
    return BusinessAssembler.toEntity(response);
  }
}
