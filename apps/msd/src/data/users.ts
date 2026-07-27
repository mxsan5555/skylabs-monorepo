export type Role = 'user' | 'admin' | 'marketing' | 'sales';

export const users = [
  {
    id: 1,
    email: 'admin@msd.com',
    mobile: '9876543210',
    role: 'admin',
    otp: '111111',
  },
  {
    id: 2,
    email: 'marketing@msd.com',
    mobile: '9876543211',
    role: 'marketing',
    otp: '222222',
  },
  {
    id: 3,
    email: 'sales@msd.com',
    mobile: '9876543212',
    role: 'sales',
    otp: '333333',
  },
  {
    id: 4,
    email: 'user@msd.com',
    mobile: '9876543213',
    role: 'user',
    otp: '444444',
  },
];