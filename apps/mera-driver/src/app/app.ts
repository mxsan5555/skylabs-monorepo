import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Showcase } from './showcase/showcase';

@Component({
  imports: [RouterModule, Showcase],
  selector: 'md-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  // Required so Angular accepts the Material Web <md-*> custom elements.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class App {}
