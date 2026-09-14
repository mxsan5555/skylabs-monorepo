import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';

@Component({
  selector: 'md-account-subcategory',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './subcategory.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Subcategory {}
