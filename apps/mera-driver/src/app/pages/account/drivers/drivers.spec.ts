import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { Drivers } from './drivers';

describe('Drivers Component', () => {
  let component: Drivers;
  let fixture: ComponentFixture<Drivers>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Drivers],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Drivers);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the component', () => {
    // Resolve initial http calls on init
    const reqCopy = httpMock.expectOne('data/drivers-registry.json');
    reqCopy.flush({});
    const reqDrivers = httpMock.expectOne('data/drivers.json');
    reqDrivers.flush([]);

    expect(component).toBeTruthy();
  });

  it('should load drivers list and copy content on init', () => {
    const reqCopy = httpMock.expectOne('data/drivers-registry.json');
    expect(reqCopy.request.method).toBe('GET');
    reqCopy.flush({ title: 'Test Registry Title' });

    const reqDrivers = httpMock.expectOne('data/drivers.json');
    expect(reqDrivers.request.method).toBe('GET');
    reqDrivers.flush([
      { id: 1, name: 'Driver A', phone: '999', vehicle: 'Car A' }
    ]);

    expect((component as any).content().title).toBe('Test Registry Title');
    expect(component.drivers().length).toBe(1);
    expect(component.drivers()[0].name).toBe('Driver A');
  });

  it('should fail to add driver if any fields are empty', () => {
    // Flush initial requests
    const reqCopy = httpMock.expectOne('data/drivers-registry.json');
    reqCopy.flush({});
    const reqDrivers = httpMock.expectOne('data/drivers.json');
    reqDrivers.flush([]);

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    component.inputName.set('Rahul');
    component.inputPhone.set(''); // Missing phone
    component.inputVehicle.set('Car');
    component.addDriver();

    expect(alertSpy).toHaveBeenCalledWith((component as any).content().errorEmptyFields);
    expect(component.drivers().length).toBe(0);

    alertSpy.mockRestore();
  });

  it('should successfully add a new driver if all fields are valid', () => {
    // Flush initial requests
    const reqCopy = httpMock.expectOne('data/drivers-registry.json');
    reqCopy.flush({});
    const reqDrivers = httpMock.expectOne('data/drivers.json');
    reqDrivers.flush([]);

    component.inputName.set('Rahul Verma');
    component.inputPhone.set('9876543210');
    component.inputVehicle.set('Hyundai Accent');
    component.addDriver();

    expect(component.drivers().length).toBe(1);
    expect(component.drivers()[0].name).toBe('Rahul Verma');
    expect(component.drivers()[0].phone).toBe('9876543210');
    expect(component.drivers()[0].vehicle).toBe('Hyundai Accent');

    // Inputs should be reset
    expect(component.inputName()).toBe('');
    expect(component.inputPhone()).toBe('');
    expect(component.inputVehicle()).toBe('');
  });
});
