import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionNavigation } from './shared/presentation/session-navigation/session-navigation';
import { SessionViewBoundary } from './iam/presentation/session-view-boundary/session-view-boundary';

@Component({
  imports: [RouterOutlet, SessionNavigation, SessionViewBoundary],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('Bodego');
}
