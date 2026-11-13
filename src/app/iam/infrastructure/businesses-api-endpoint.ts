import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewBusiness, BusinessChanges } from '../domain/business.repository';
import { Business } from '../domain/model/business.entity';
import { BusinessResponse } from './responses/business.response';
import { IAM_ENDPOINTS } from './iam-endpoints';

@Injectable({ providedIn: 'root' })
export class BusinessesApiEndpoint extends BaseApiEndpoint<
  BusinessResponse,
  NewBusiness,
  BusinessChanges | Pick<Business, 'active'>
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + IAM_ENDPOINTS.businesses);
  }
}
