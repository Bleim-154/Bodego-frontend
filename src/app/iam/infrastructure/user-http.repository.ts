import { Injectable, inject } from '@angular/core';

import { User } from '../domain/model/user.entity';
import { UserRepository, NewUser, UserChanges } from '../domain/user.repository';
import { UsersApiEndpoint } from './users-api-endpoint';
import { UserAssembler } from './assemblers/user.assembler';

@Injectable()
export class UserHttpRepository extends UserRepository {
  private readonly endpoint = inject(UsersApiEndpoint);

  override async getAll(): Promise<User[]> {
    const responses = await this.endpoint.getAll();
    return responses.map(response => UserAssembler.toEntity(response));
  }

  override async getById(id: string): Promise<User> {
    const response = await this.endpoint.getById(id);
    return UserAssembler.toEntity(response);
  }

  override async create(data: NewUser): Promise<User> {
    const response = await this.endpoint.create(data);
    return UserAssembler.toEntity(response);
  }

  override async update(id: string, changes: UserChanges): Promise<User> {
    const response = await this.endpoint.update(id, changes);
    return UserAssembler.toEntity(response);
  }

  override async changeStatus(id: string, active: boolean): Promise<User> {
    const response = await this.endpoint.update(id, { active });
    return UserAssembler.toEntity(response);
  }
}
