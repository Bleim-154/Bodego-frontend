import { Batch } from './model/batch.entity';

export interface BatchMetadataChanges {
  code: string;
  expirationDate: string | null;
}

/** Metadata only; stock and product association cannot be changed through this port. */
export abstract class BatchMetadataRepository {
  abstract updateMetadata(id: string, changes: BatchMetadataChanges): Promise<Batch>;
}
