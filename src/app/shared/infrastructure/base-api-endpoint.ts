import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** JSON Server transport; repository adapters retain domain mapping. */
export abstract class BaseApiEndpoint<TResponse, TCreate, TUpdate> {
  protected constructor(
    protected readonly http: HttpClient,
    protected readonly endpointUrl: string
  ) {}

  getAll(): Promise<TResponse[]> {
    return firstValueFrom(this.http.get<TResponse[]>(this.endpointUrl));
  }

  getById(id: string): Promise<TResponse> {
    return firstValueFrom(this.http.get<TResponse>(this.resourceUrl(id)));
  }

  create(resource: TCreate): Promise<TResponse> {
    return firstValueFrom(this.http.post<TResponse>(this.endpointUrl, resource));
  }

  update(id: string, changes: TUpdate): Promise<TResponse> {
    return firstValueFrom(this.http.patch<TResponse>(this.resourceUrl(id), changes));
  }

  protected resourceUrl(id: string): string {
    return this.endpointUrl + '/' + encodeURIComponent(id);
  }
}
