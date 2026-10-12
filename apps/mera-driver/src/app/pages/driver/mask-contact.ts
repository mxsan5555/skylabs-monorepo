/** Masks phone/email for display on summary surfaces (dashboard header) — the
 *  full value is always still available unmasked on the profile page itself. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'Not provided';
  const digits = phone.trim();
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 2)}${'•'.repeat(digits.length - 4)}${digits.slice(-2)}`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'Not provided';
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const visible = user.slice(0, 1) || '•';
  return `${visible}${'•'.repeat(Math.max(user.length - 1, 1))}@${domain}`;
}
