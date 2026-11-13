import { inject, Injectable } from '@angular/core';
import { StockControlCommandPort } from '../domain/stock-control-command.port';
import { RegisterPhysicalCountCommand } from './register-physical-count.use-case';
import { RegisterWasteCommand } from './register-waste.use-case';
import { BusinessContextService } from '../../iam/application/business-context.service';

async function authorized<T>(
  context: BusinessContextService,
  action: () => Promise<T>,
  admin = false,
): Promise<T> {
  const operation = context.captureOperation();
  if (admin) operation.assertRole('ADMIN');
  else if (operation.role !== 'ADMIN' && operation.role !== 'EMPLOYEE')
    throw new Error('No tiene permisos.');
  return operation.complete(action());
}

// These route-local alternatives never invoke the simulated stock/audit orchestration.
@Injectable()
export class RegisterBackendPhysicalCountUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly commands = inject(StockControlCommandPort);
  execute(input: RegisterPhysicalCountCommand) {
    return authorized(this.context, () => this.commands.count(input));
  }
}
@Injectable()
export class ApplyBackendStockAdjustmentUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly commands = inject(StockControlCommandPort);
  execute(id: string, reason: string) {
    return authorized(this.context, () => this.commands.adjust(id, reason), true);
  }
}
@Injectable()
export class RegisterBackendWasteUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly commands = inject(StockControlCommandPort);
  execute(input: RegisterWasteCommand) {
    return authorized(this.context, () => this.commands.waste(input));
  }
}
@Injectable()
export class CreateBackendCorrectionRequestUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly commands = inject(StockControlCommandPort);
  execute(id: string, reason: string) {
    return authorized(this.context, () => this.commands.request(id, reason));
  }
}
@Injectable()
export class ReviewBackendCorrectionRequestUseCase {
  private readonly context = inject(BusinessContextService);
  private readonly commands = inject(StockControlCommandPort);
  execute(id: string, approved: boolean, comment: string) {
    return authorized(this.context, () => this.commands.review(id, approved, comment), true);
  }
}
