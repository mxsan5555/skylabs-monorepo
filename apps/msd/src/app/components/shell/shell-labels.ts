import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { isCustomerUser, isStaffUser } from '../../../auth/role-routing';
import content from '../../../content.json';

/** Accessible name for a counted action ("Cart, 2 items"); the visible label stays a prefix
 *  so WCAG 2.5.3 label-in-name holds. */
export function countLabel(label: string, count: number): string {
  if (count <= 0) return label;
  const template = count === 1 ? content.header.countLabelOne : content.header.countLabel;
  return template.replace('{label}', label).replace('{count}', String(count));
}

/** Where "Account" goes for the current visitor. */
export function useAccountLinks() {
  const { isAuthenticated, bootstrap } = useAuth();
  const isCustomer = !!bootstrap && isCustomerUser(bootstrap) && !isStaffUser(bootstrap);
  return {
    isAuthenticated,
    isCustomer,
    accountPath: !isAuthenticated ? '/sign-in' : isCustomer ? '/my-account' : '/account',
  };
}
