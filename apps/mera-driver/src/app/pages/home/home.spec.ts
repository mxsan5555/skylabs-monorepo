import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { Home } from './home';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Home Component', () => {
  let component: Home;
  let httpMock: any;

  beforeEach(() => {
    httpMock = {
      get: vi.fn().mockReturnValue(of({
        hero: {
          title: 'Dynamic Home Title'
        }
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        Home,
        { provide: HttpClient, useValue: httpMock },
      ],
    });

    component = TestBed.inject(Home);
  });

  it('should initialize component and fetch home config data from json', () => {
    component.ngOnInit();
    expect(httpMock.get).toHaveBeenCalledWith('data/home.json');
    expect(component['content']().hero.title).toBe('Dynamic Home Title');
  });

  it('should fallback to defaults if get call fails', () => {
    httpMock.get.mockReturnValue(throwError(() => new Error('Offline')));
    component.ngOnInit();
    expect(component['content']().hero.title).toBe('Your driver, your way');
  });
});
