export const copy = {
  signIn: {
    title: 'Sign in',
    subtitle: 'Enter your details to receive a one-time code.12345',
    phoneLabel: 'Phone number',
    emailLabel: 'Email',
    sendOtp: 'Send OTP',
    sending: 'Sending...',
    continueWith: 'or continue with',
    continueWithGoogle: 'Continue with Google',
    newUserNote: 'New users are registered automatically.',
  },

  errors: {
    invalidPhone: 'Enter a valid Indian mobile number',
    invalidEmail: 'Enter a valid email address',
    phoneRequired: 'Phone number is required',
    emailRequired: 'Email is required',
    invalidOtp: 'Invalid OTP'
  },

  otp: {
    pageTitle: 'Verify your phone · MSD',
    title: 'Verify your phone',
    subtitle: 'We sent a 6-digit code to',
    enterCode: 'Enter the code',
    codeExpiry: 'The code expires in a few minutes.',
    codeLabel: '6-digit code',
    resendQuestion: 'Didn’t receive the code?',

  },
  contact: {
    hero: {
      badge: 'Get in Touch',
      title: 'Contact Us',
      description:
        "We'd love to hear from you. Whether you have questions about our services, bookings, partnerships, or wellness programs, our team is always ready to help.",
    },

    form: {
      title: 'Send us a Message',
      description: "Fill out the form below and we'll get back to you as soon as possible.",
      successMessage: 'Message Sent',
    },

    errors: {
      invalidEmail: 'Enter a valid email',
      invalidPhone: 'Enter a valid phone number',
    },

    info: {
      title: 'Contact Information',

      visitTitle: 'Visit Us',
      visitAddress: [
        'MSD Wellness Center',
        'DLF Phase 4',
        'Gurugram, Haryana',
      ],

      phoneTitle: 'Phone',
      phone: '+91 98765 43210',

      emailTitle: 'Email',
      email: 'support@msd.com',

      hoursTitle: 'Working Hours',
      hours: [
        'Monday – Saturday',
        '9:00 AM – 7:00 PM',
      ],
    },

    map: {
      title: 'Find Us',
      description:
        'Visit our wellness center or use the map below to plan your journey.',
    },
  },
  footer: {
    brand: {
      icon: 'spa',
      name: 'MSD',
    },

    company: {
      title: 'About Company',
      description:
        'Discover the best spa, salon and wellness deals near you. Book instantly and enjoy premium experiences at unbeatable prices.',
      stats: [
        { value: '50+', label: 'Partners' },
        { value: '20+', label: 'Cities' },
        { value: '24×7', label: 'Support' },
      ],
    },

    columns: [
      {
        title: 'Help Center',
        icon: 'help_center',
        links: [
          { label: 'How to Pay', href: '/how-to-pay' },
          { label: 'Delivery Info', href: '/delivery-info' },
          { label: 'FAQs', href: '/faqs' },
          { label: 'Contact Support', href: '/contact' },
        ],
      },
      {
        title: 'Customer Information',
        icon: 'chart_data',
        links: [
          { label: 'About Us', href: '/about-us' },
          { label: 'List Your Business', href: '/list-your-business' },
          { label: 'Contact', href: '/contact' },
          { label: 'Blog', href: '/blog' },
        ],
      },
      {
        title: 'Security & Privacy',
        icon: 'privacy_tip',
        links: [
          { label: 'Terms of Use', href: '/terms-of-use' },
          { label: 'Privacy Policy', href: '/privacy-policy' },
          { label: 'Return / Refund Policy', href: '/return-policy' },
        ],
      },
    ],

    download: {
      title: 'Download App',
      buttons: [
        {
          icon: 'smartphone',
          label: 'Google Play',
        },
        {
          icon: 'phone_iphone',
          label: 'App Store',
        },
      ],
    },

    social: [
      {
        icon: 'mobile_chat',
        ariaLabel: 'Facebook',
      },
      {
        icon: 'photo_camera',
        ariaLabel: 'Instagram',
      },
      {
        icon: 'alternate_email',
        ariaLabel: 'Twitter',
      },
      {
        icon: 'smart_display',
        ariaLabel: 'YouTube',
      },
    ],

    bottomLinks: [
      {
        label: 'Privacy',
        href: '/privacy-policy',
      },
      {
        label: 'Terms',
        href: '/terms-of-use',
      },
      {
        label: 'Cookies',
        href: '/cookies',
      },
    ],
  }
};