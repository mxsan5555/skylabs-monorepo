/** Maps a `Driver.status` value to a `sky-badge` variant — shared by the driver
 *  dashboard and KYC pages so the color coding stays consistent between them. */
export function statusVariant(status: string): 'primary' | 'secondary' | 'tertiary' | 'error' {
  if (status === 'Verified') return 'primary';
  if (status.startsWith('Partially Verified')) return 'tertiary';
  if (status === 'Blacklisted' || status === 'Not Useful' || status === 'Closed') return 'error';
  return 'secondary'; // Non-Verified and anything else
}
