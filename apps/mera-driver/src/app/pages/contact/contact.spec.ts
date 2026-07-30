import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { Contact } from './contact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Contact Component', () => {
  let component: Contact;
  let httpMock: any;

  beforeEach(() => {
    httpMock = {
      get: vi.fn().mockReturnValue(of({
        faqSection: {
          tagline: 'Custom Tagline',
          title: 'Custom Title',
          description: 'Custom Description'
        },
        faqs: [
          { id: 1, question: 'Q1', answer: 'A1' }
        ]
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        Contact,
        { provide: HttpClient, useValue: httpMock },
      ],
    });

    component = TestBed.inject(Contact);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize component and fetch FAQ layout from json', () => {
    component.ngOnInit();
    expect(httpMock.get).toHaveBeenCalledWith('/data/contact.json');
    expect(component['content']().faqSection.tagline).toBe('Custom Tagline');
    expect(component['content']().faqs[0].question).toBe('Q1');
  });

  it('should fallback to defaults if get call fails', () => {
    httpMock.get.mockReturnValue(throwError(() => new Error('Not Found')));
    component.ngOnInit();
    // Default brand/faq details should remain intact
    expect(component['content']().faqSection.tagline).toBe('Got Questions?');
    expect(component['content']().faqs.length).toBe(4);
  });

  it('should handle name input and clear name error', () => {
    component['nameError'].set('Name error');
    const mockEvent = {
      target: { value: 'Rahul Verma' }
    } as any as Event;

    component['onInputName'](mockEvent);

    expect(component['name']()).toBe('Rahul Verma');
    expect(component['nameError']()).toBe('');
  });

  it('should handle company input and clear company error', () => {
    component['companyError'].set('Company error');
    const mockEvent = {
      target: { value: 'Skylabs' }
    } as any as Event;

    component['onInputCompany'](mockEvent);

    expect(component['company']()).toBe('Skylabs');
    expect(component['companyError']()).toBe('');
  });

  it('should handle email input and clear email error', () => {
    component['emailError'].set('Email error');
    const mockEvent = {
      target: { value: 'test@email.com' }
    } as any as Event;

    component['onInputEmail'](mockEvent);

    expect(component['email']()).toBe('test@email.com');
    expect(component['emailError']()).toBe('');
  });

  it('should handle phone input, filter non-numeric characters, and truncate to 10 digits', () => {
    component['phoneError'].set('Phone error');
    const mockTarget = { value: '999abc999-99-999' }; // extra letters and symbols and digits
    const mockEvent = {
      target: mockTarget
    } as any as Event;

    component['onInputPhone'](mockEvent);

    expect(mockTarget.value).toBe('9999999999'); // exactly 10 digits
    expect(component['phone']()).toBe('9999999999');
    expect(component['phoneError']()).toBe('');
  });

  it('should handle subject selection', () => {
    const mockEvent = {
      target: { value: 'fleet' }
    } as any as Event;

    component['onSelectSubject'](mockEvent);

    expect(component['subject']()).toBe('fleet');
  });

  it('should handle message input and clear message error', () => {
    component['messageError'].set('Message error');
    const mockEvent = {
      target: { value: 'Test message description.' }
    } as any as Event;

    component['onInputMessage'](mockEvent);

    expect(component['message']()).toBe('Test message description.');
    expect(component['messageError']()).toBe('');
  });

  it('should validate empty inputs on submit', () => {
    component['submitForm']();

    expect(component['nameError']()).toBe('Please enter your full name.');
    expect(component['companyError']()).toBe('Please enter your company or organization name.');
    expect(component['emailError']()).toBe('Please enter your official email address.');
    expect(component['phoneError']()).toBe('Please enter your contact number.');
    expect(component['messageError']()).toBe('Please enter details about your inquiry.');
  });

  it('should validate invalid email syntax', () => {
    component['name'].set('Name');
    component['company'].set('Company');
    component['email'].set('invalid-email-format');
    component['submitForm']();

    expect(component['emailError']()).toBe('Please enter a valid email address.');
  });

  it('should validate invalid phone digit length', () => {
    component['name'].set('Name');
    component['company'].set('Company');
    component['email'].set('test@email.com');
    component['phone'].set('1234'); // too short
    component['submitForm']();

    expect(component['phoneError']()).toBe('Please enter a valid 10-digit phone number.');
  });

  it('should validate short message details length', () => {
    component['name'].set('Name');
    component['company'].set('Company');
    component['email'].set('test@email.com');
    component['phone'].set('9999999999');
    component['message'].set('short'); // under 10 chars
    component['submitForm']();

    expect(component['messageError']()).toBe('Inquiry details must be at least 10 characters long.');
  });

  it('should successfully submit form and reset on simulated API timeout', () => {
    vi.useFakeTimers();
    component['name'].set('Rahul');
    component['company'].set('Skylabs');
    component['email'].set('rahul@skylabs.com');
    component['phone'].set('9999911111');
    component['message'].set('I need a corporate package for 10 cabs.');

    component['submitForm']();

    expect(component['isSubmitting']()).toBe(true);

    vi.advanceTimersByTime(1500);

    expect(component['isSubmitting']()).toBe(false);
    expect(component['isSuccess']()).toBe(true);
    expect(component['name']()).toBe('');
    expect(component['company']()).toBe('');
    expect(component['email']()).toBe('');
    expect(component['phone']()).toBe('');
    expect(component['message']()).toBe('');
  });

  it('should reset success banner on resetSuccess', () => {
    component['isSuccess'].set(true);
    component['resetSuccess']();
    expect(component['isSuccess']()).toBe(false);
  });
});
