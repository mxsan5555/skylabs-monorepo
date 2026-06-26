import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'md-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Contact {
  // FAQ signals
  protected readonly faqs = signal([
    {
      id: 1,
      question: 'How do corporate cab services work?',
      answer: 'Corporate clients get a dedicated dashboard to manage employee rides, set custom approval hierarchies, schedule recurring routes, and access monthly consolidated invoicing. You can start the setup process by filling out the form above.',
      open: false
    },
    {
      id: 2,
      question: 'What is the average timeline for API key deployment?',
      answer: 'Standard API credentials are generated within 24 hours. For advanced routing algorithms and custom fleet integrations, our developer relations team will collaborate with your engineering team to guide you from sandbox to production in 3-5 business days.',
      open: false
    },
    {
      id: 3,
      question: 'Is there a dedicated helpline for corporate fleet support?',
      answer: 'Yes. All corporate contracts include 24/7 dedicated telephone support and live fleet monitoring to resolve any on-road dispatch issues instantly.',
      open: false
    },
    {
      id: 4,
      question: 'Can we customize the driver selection and vehicle types?',
      answer: 'Absolutely. Our platform allows corporate accounts to set specific vehicle class rules (e.g. EV-only, premium sedans) and prioritize top-rated driver tiers based on employee roles or distance categories.',
      open: false
    }
  ]);

  // Form signals
  protected readonly name = signal<string>('');
  protected readonly company = signal<string>('');
  protected readonly email = signal<string>('');
  protected readonly phone = signal<string>('');
  protected readonly subject = signal<string>('corporate');
  protected readonly message = signal<string>('');

  // Validation errors
  protected readonly nameError = signal<string>('');
  protected readonly companyError = signal<string>('');
  protected readonly emailError = signal<string>('');
  protected readonly phoneError = signal<string>('');
  protected readonly messageError = signal<string>('');

  // Submission state
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly isSuccess = signal<boolean>(false);

  protected onInputName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value || '');
    this.nameError.set('');
  }

  protected onInputCompany(event: Event): void {
    this.company.set((event.target as HTMLInputElement).value || '');
    this.companyError.set('');
  }

  protected onInputEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value || '');
    this.emailError.set('');
  }

  protected onInputPhone(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/[^0-9]/g, ''); // Remove non-numeric characters
    if (value.length > 10) {
      value = value.substring(0, 10);
    }
    input.value = value; // Force update input element value
    this.phone.set(value);
    this.phoneError.set('');
  }

  protected onSelectSubject(event: Event): void {
    this.subject.set((event.target as HTMLSelectElement).value || 'corporate');
  }


  protected onInputMessage(event: Event): void {
    this.message.set((event.target as HTMLTextAreaElement).value || '');
    this.messageError.set('');
  }

  protected submitForm(): void {
    const currentName = this.name().trim();
    const currentCompany = this.company().trim();
    const currentEmail = this.email().trim();
    const currentPhone = this.phone().trim();
    const currentMessage = this.message().trim();

    let isValid = true;

    // Reset errors
    this.nameError.set('');
    this.companyError.set('');
    this.emailError.set('');
    this.phoneError.set('');
    this.messageError.set('');

    if (!currentName) {
      this.nameError.set('Please enter your full name.');
      isValid = false;
    }

    if (!currentCompany) {
      this.companyError.set('Please enter your company or organization name.');
      isValid = false;
    }

    if (!currentEmail) {
      this.emailError.set('Please enter your official email address.');
      isValid = false;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(currentEmail)) {
        this.emailError.set('Please enter a valid email address.');
        isValid = false;
      }
    }

    if (!currentPhone) {
      this.phoneError.set('Please enter your contact number.');
      isValid = false;
    } else {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(currentPhone)) {
        this.phoneError.set('Please enter a valid 10-digit phone number.');
        isValid = false;
      }
    }

    if (!currentMessage) {
      this.messageError.set('Please enter details about your inquiry.');
      isValid = false;
    } else if (currentMessage.length < 10) {
      this.messageError.set('Inquiry details must be at least 10 characters long.');
      isValid = false;
    }

    if (!isValid) return;

    this.isSubmitting.set(true);

    // Simulate API form submission
    setTimeout(() => {
      this.isSubmitting.set(false);
      this.isSuccess.set(true);
      
      // Reset form fields
      this.name.set('');
      this.company.set('');
      this.email.set('');
      this.phone.set('');
      this.subject.set('corporate');
      this.message.set('');
    }, 1500);
  }

  protected resetSuccess(): void {
    this.isSuccess.set(false);
  }

  protected toggleFaq(id: number): void {
    this.faqs.update((list) =>
      list.map((item) => ({
        ...item,
        open: item.id === id ? !item.open : false
      }))
    );
  }
}
