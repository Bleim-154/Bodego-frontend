import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Recommendation } from '../../domain/model/recommendation.entity';
import { GetRecommendationsUseCase } from '../../application/get-recommendations.use-case';
import { GenerateRecommendationsUseCase } from '../../application/generate-recommendations.use-case';
import { DismissRecommendationUseCase } from '../../application/dismiss-recommendation.use-case';

@Component({
  selector: 'app-recommendation-management',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './recommendation-management.html',
  styleUrl: './recommendation-management.css',
})
export class RecommendationManagement implements OnInit {
  private readonly getRecommendations = inject(GetRecommendationsUseCase);
  private readonly generateRecommendations = inject(GenerateRecommendationsUseCase);
  private readonly dismissRecommendation = inject(DismissRecommendationUseCase);

  readonly recommendations = signal<Recommendation[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly showDismissed = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const data = await this.getRecommendations.execute();

      this.recommendations.set(
        [...data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      );
    } catch {
      this.error.set('No se pudieron cargar las recomendaciones.');
    } finally {
      this.loading.set(false);
    }
  }

  visibleRecommendations(): Recommendation[] {
    return this.recommendations().filter((item) => this.showDismissed() || !item.dismissed);
  }

  async generate(): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      const created = await this.generateRecommendations.execute();
      await this.load();

      this.message.set(`${created} recomendaciones nuevas generadas.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al generar recomendaciones.');
    } finally {
      this.saving.set(false);
    }
  }

  async dismiss(id: string): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.dismissRecommendation.execute(id);
      await this.load();

      this.message.set('Recomendación descartada.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Error al descartar.');
    } finally {
      this.saving.set(false);
    }
  }
}
