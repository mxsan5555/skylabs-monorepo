import { useState } from 'react';
import { Divider, FilledButton, OutlinedTextField, Icon, AssistChip, } from '@skylabs-monorepo/shared-ui/react';
import './careers.css';
import {validateEmail,validatePhone,} from '../../../utils/validation';
const staticJobs = [
  {
    department: 'Engineering',
    title: 'Frontend Developer',
    location: 'Noida / Hybrid',
    employmentType: 'Full-Time',
    icon: 'code',
    description:'Build responsive and accessible experiences for our wellness marketplace.',
  },
  {
    department: 'Product & Design',
    title: 'UI/UX Designer',
    location: 'Noida / Hybrid',
    employmentType: 'Full-Time',
    icon: 'design_services',
    description:'Design intuitive booking and shopping journeys for our customers.',
  },
  {
    department: 'Business',
    title: 'Business Development Executive',
    location: 'Noida',
    employmentType: 'Full-Time',
    icon: 'handshake',
    description:'Help grow our network of spa, salon and wellness partners.',
  },
];
function CareersRoadmap() {
  const steps = [
    {title: 'Application Review',
      description:'Our recruitment desk reviews your technical foundation.',
    },
    {title: 'Technical Assessment',
      description:'Deep-dive interview with our subject matter experts.',
    },
    {title: 'Cultural Alignment',
      description:'Final discussion on ethics, mission, and institutional fit.',
    },
    {title: 'Onboarding',
      description:'Join the team and start building better wellness experiences.',
    }
  ];
  return (
    <section className="careers-roadmap" aria-labelledby="careers-roadmap-title">
      <div className="careers-container">
        <div className="careers-roadmap-heading">
          <h2 id="careers-roadmap-title">Your Path To Excellence</h2>
        </div>
        <div className="careers-roadmap-grid">
          {steps.map((step, index) => (
            <sky-feature-card
              key={step.title}
              color={index % 2 === 0 ? 'tertiary' : 'secondary'}
              icon="route"
              icon-style="tonal"
              headline={step.title}
              text={step.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
function CareersEnquiry() {
  const [phone, setPhone] = useState('');
  const handlePhoneInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const numbersOnly = target.value.replace(/\D/g, '').slice(0, 10);
    target.value = numbersOnly;
    setPhone(numbersOnly);
  };
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '');
    const phone = String(formData.get('phone') ?? '');
    if (!validateEmail(email)) {alert('Please enter a valid email address.');return;}
    if (!validatePhone(phone)) {alert('Please enter a valid 10-digit mobile number.');return;
    }};
  return (
    <section id="enquiry-form" className="careers-enquiry" aria-labelledby="careers-enquiry-title">
      <div className="careers-container careers-enquiry-grid">
        <div className="careers-enquiry-copy">
          <p className="careers-eyebrow">DIRECT CONNECT</p>
          <h2 id="careers-enquiry-title">Begin Your <span>Career Journey</span></h2>
          <p>Interested in joining our team? Leave your details below and our talent acquisition team can connect with you.</p>
        </div>
        <sky-tile-card
          headline="Submit Your Application"
          text="Share your details and our team will get in touch."
          color="none"
        >
          <form onSubmit={handleSubmit} className="careers-enquiry-form">
            <div className="careers-enquiry-fields">
              <OutlinedTextField
                label="Full Name"
                name="fullName"
                type="text"
                placeholder="Your name"
                autocomplete="name"
                required
              />
              <OutlinedTextField
                label="Email Address"
                name="email"
                type="email"
                autocomplete="email"
                required
              />
            </div>
            <OutlinedTextField
              label="Contact No."
              name="phone"
              type="tel"
              autocomplete="tel"
              placeholder="10-digit mobile number"
              maxLength={10}
              value={phone}
              onInput={handlePhoneInput}
              required
            />
            <OutlinedTextField
              label="Technical Expertise / Message"
              name="message"
              type="textarea"
              rows={4}
              placeholder="Tell us about your skills and the role you're interested in..."
              required
            />
            <FilledButton>Submit Application
              <Icon slot="icon" aria-hidden="true">arrow_forward</Icon>
            </FilledButton>
          </form>
        </sky-tile-card>
      </div>
    </section>
  );
}
export default function Careers() {
   const handleApplyClick = () => {
    document.getElementById('enquiry-form')?.scrollIntoView({behavior: 'smooth',block: 'start',});
  };
  return (
    <main className="careers-page">
      <CareersRoadmap />
      <Divider />
      <section
        className="careers-openings careers-container"
        id="open-positions"
        aria-labelledby="careers-openings-title"
      >
        <div className="careers-section-heading">
            <h2 id="careers-openings-title">Current Openings</h2>
          <AssistChip className="careers-position-count">
            {staticJobs.length}{' '}
            {staticJobs.length === 1 ? 'opening' : 'openings'}
          </AssistChip>
        </div>
        <div className="careers-static-job-grid">
          {staticJobs.map((job) => (
            <sky-cta-banner
              key={job.title}
              color="surface-high"
              variant="outlined"
              shape="large"
              layout="horizontal"
              icon={job.icon}
              iconStyle="tonal"
              headline={job.title}
              text={job.description}
            >
              <div slot="actions" className="careers-job-actions">
                <div className="careers-job-info">
                  <AssistChip label={job.department} />
                  <AssistChip label={job.location} />
                  <AssistChip label={job.employmentType} />
                </div>
                <FilledButton onClick={handleApplyClick}>Apply Now
                  <Icon slot="icon" aria-hidden="true">arrow_forward</Icon>
                </FilledButton>
              </div>
            </sky-cta-banner>
          ))}
        </div>
      </section>
      <CareersEnquiry />
    </main>
  );
}
