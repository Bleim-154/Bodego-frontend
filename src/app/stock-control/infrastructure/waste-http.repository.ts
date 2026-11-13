import { Injectable, inject } from '@angular/core';

import { Waste } from '../domain/model/waste.entity';
import { WasteRepository, NewWaste } from '../domain/waste.repository';
import { WastesApiEndpoint } from './wastes-api-endpoint';
import { WasteAssembler } from './assemblers/waste.assembler';

@Injectable()
export class WasteHttpRepository extends WasteRepository {
  private readonly endpoint = inject(WastesApiEndpoint);

  override async getAll(): Promise<Waste[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => WasteAssembler.toEntity(response));
  }

  override async create(data: NewWaste): Promise<Waste> {
    const response = await this.endpoint.create(data);
    return WasteAssembler.toEntity(response);
  }
}
