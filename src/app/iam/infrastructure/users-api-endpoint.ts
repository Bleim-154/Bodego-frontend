import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewUser, UserChanges } from '../domain/user.repository';
import { User } from '../domain/model/user.entity';
import { UserResponse } from './responses/user.response';
import { IAM_ENDPOINTS } from './iam-endpoints';

@Injectable({ providedIn: 'root' })
export class UsersApiEndpoint extends BaseApiEndpoint<
  UserResponse,
  NewUser,
  UserChanges | Pick<User, 'active'>
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + IAM_ENDPOINTS.users);
  }
}
