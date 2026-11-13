import { inject, Injectable } from '@angular/core';
import { BatchMetadataChanges, BatchMetadataRepository } from '../domain/batch-metadata.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';
import { Batch } from '../domain/model/batch.entity';

@Injectable()
export class UpdateBatchMetadataUseCase {
  private readonly repository = inject(BatchMetadataRepository);
  private readonly context = inject(BusinessContextService);

  async execute(id: string, changes: BatchMetadataChanges): Promise<Batch> {
    const operation = this.context.captureOperation();
    operation.assertRole('ADMIN');
    return operation.complete(this.repository.updateMetadata(id, changes));
  }
}
