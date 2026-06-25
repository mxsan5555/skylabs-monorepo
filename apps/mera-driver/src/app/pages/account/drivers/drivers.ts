import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface Driver {
  id?: number;
  name: string;
  phone: string;
  vehicle: string;
}

@Component({
  selector: 'md-account-drivers',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './drivers.html',
  styleUrl: './drivers.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Drivers implements OnInit {
  private readonly http = inject(HttpClient);

  // --- Dynamic Drivers State ---
  readonly drivers = signal<Driver[]>([]);

  // --- Temporary Form Input Signals ---
  readonly inputName = signal<string>('');
  readonly inputPhone = signal<string>('');
  readonly inputVehicle = signal<string>('');

  ngOnInit(): void {
    // Load static data from the JSON file inside public/data directory
    this.http.get<Driver[]>('data/drivers.json').subscribe({
      next: (data) => {
        this.drivers.set(data);
      },
      error: (err) => {
        console.error('Failed to load mock drivers JSON', err);
      }
    });
  }

  // --- Add New Driver Action ---
  addDriver(): void {
    const name = this.inputName().trim();
    const phone = this.inputPhone().trim();
    const vehicle = this.inputVehicle().trim();

    if (!name || !phone || !vehicle) {
      alert('Please fill out all driver input fields.');
      return;
    }

    const newDriver: Driver = {
      id: Date.now(),
      name,
      phone,
      vehicle
    };

    // Update list dynamically by appending new driver
    this.drivers.update((list) => [...list, newDriver]);

    // Reset inputs
    this.inputName.set('');
    this.inputPhone.set('');
    this.inputVehicle.set('');
  }

  // --- Handle Input Events from custom md elements ---
  onNameInput(event: Event): void {
    this.inputName.set((event.target as any).value || '');
  }

  onPhoneInput(event: Event): void {
    this.inputPhone.set((event.target as any).value || '');
  }

  onVehicleInput(event: Event): void {
    this.inputVehicle.set((event.target as any).value || '');
  }
}
