import { User } from '../../domain/model/user.entity';
import { UserResponse } from '../responses/user.response';

export class UserAssembler {
  static toEntity(response: UserResponse): User {
    return {
      id: String(response.id),
      businessId: String(response.businessId),
      fullName: response.fullName,
      email: response.email,
      role: response.role,
      active: response.active,
    };
  }
}
