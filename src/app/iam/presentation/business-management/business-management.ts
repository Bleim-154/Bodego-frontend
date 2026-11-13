import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../application/session.service';
@Component({
  selector: 'app-business-management',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './business-management.html',
  styleUrl: './business-management.css',
})
export class BusinessManagement {
  readonly session = inject(SessionService);
}
