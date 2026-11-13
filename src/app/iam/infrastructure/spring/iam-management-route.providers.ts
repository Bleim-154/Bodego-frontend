import { Provider } from '@angular/core';
import { UserDirectoryPort, EmployeeCreationPort } from '../../domain/user-directory.port';
import {
  ManageUserDirectoryUseCase,
  CreateEmployeeUseCase,
} from '../../application/manage-user-directory.use-case';
import { SpringUserDirectoryRepository } from './spring-user-directory.repository';
import { IamManagementGateway } from './iam-management.gateway';
export const REAL_IAM_MANAGEMENT_PROVIDERS: Provider[] = [
  IamManagementGateway,
  SpringUserDirectoryRepository,
  { provide: UserDirectoryPort, useExisting: SpringUserDirectoryRepository },
  { provide: EmployeeCreationPort, useExisting: SpringUserDirectoryRepository },
  ManageUserDirectoryUseCase,
  CreateEmployeeUseCase,
];
