import { apiGet } from './rbac/client';

export interface CustomerDashboardSummary {
    totalDealCount: number;
    totalProductBoughtCount: number;
    cartItemCount: number;
    wishlistItemCount: number;
}

export function getCustomerDashboardSummary(token: string | null) {
    return apiGet<CustomerDashboardSummary>(
        '/customer/dashboard-summary',
        token,
    );
}