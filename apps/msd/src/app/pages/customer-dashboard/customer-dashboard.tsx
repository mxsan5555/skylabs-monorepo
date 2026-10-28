
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCustomerDashboardSummary } from '../../../api/customer-dashboard';
import { ApiRequestError } from '../../../api/rbac/client';
import content from '../../../content.json';
import './customer-dashboard.css';
interface DashboardStats {
    deals: number;
    products: number;
    cart: number;
    wishlist: number;
}
const t = content.customerDashboard;
export function CustomerDashboard() {
    const { token, signOut } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState<DashboardStats>({
        deals: 0,
        products: 0,
        cart: 0,
        wishlist: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        async function loadDashboard() {
            setLoading(true);
            setError('');
            try {
                const response = await getCustomerDashboardSummary(token);
                if (cancelled) return;
                setStats({
                    deals: response.data.totalDealCount,
                    products: response.data.totalProductBoughtCount,
                    cart: response.data.cartItemCount,
                    wishlist: response.data.wishlistItemCount,
                });
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof ApiRequestError ? err.message : t.errors.load,);
            } finally { if (!cancelled) { setLoading(false); } }
        }
        void loadDashboard();
        return () => { cancelled = true; };
    }, [token]);
    const logout = () => {
        signOut();
        navigate('/sign-in', { replace: true });
    };
    if (loading) {
        return (
            <div className="dashboard-page">
                <sky-info-card
                    icon="dashboard"
                    heading={t.loading.heading}
                    subheading={t.loading.subheading}
                />
            </div>
        );
    }
    const statItems = [
        {
            key: 'deals',
            value: stats.deals, ...t.stats.deals,
            to: '/orders?type=SERVICE',
        },
        {
            key: 'products',
            value: stats.products, ...t.stats.products,
            to: '/orders?type=PRODUCT',
        },
        {
            key: 'cart',
            value: stats.cart, ...t.stats.cart,
            to: '/cart',
        },
        {
            key: 'wishlist',
            value: stats.wishlist, ...t.stats.wishlist,
            to: '/wishlist',
        },
    ];
    return (
        <div className="dashboard-page">
            <title>{t.metaTitle}</title>
            {error && (
                <sky-card className="customer-dashboard__error">
                    <div className="customer-dashboard__error-content">
                        <Icon aria-hidden="true">{t.errors.icon}</Icon>
                        <span>{error}</span>
                    </div>
                </sky-card>
            )}
            <div className="dashboard-stats customer-dashboard__stats">
                {statItems.map((item) => (
                    <Link
                        key={item.key}
                        to={item.to}
                        className="dashboard-stat"
                    >
                        <span className="dashboard-stat__icon"><Icon aria-hidden="true">{item.icon}</Icon></span>
                        <span className="dashboard-stat__text">
                            <p className="dashboard-stat__value title-large">{item.value}</p>
                            <p className="dashboard-stat__label body-medium">{item.label}</p>
                        </span>
                        <span className="dashboard-stat__go">
                            <Icon aria-hidden="true">{t.stats.linkIcon}</Icon>
                        </span>
                    </Link>
                ))}
            </div>
            <div className="customer-dashboard__quick-actions">
                <sky-info-card
                    icon={t.quickActions.orders.icon}
                    heading={t.quickActions.orders.heading}
                    subheading={t.quickActions.orders.subheading}
                >
                    <OutlinedButton onClick={() => navigate('/orders')}>{t.quickActions.orders.button}
                        <Icon slot="icon" aria-hidden="true">{t.icons.arrowForward}</Icon>
                    </OutlinedButton>
                </sky-info-card>
                <sky-info-card
                    icon={t.quickActions.profile.icon}
                    heading={t.quickActions.profile.heading}
                    subheading={t.quickActions.profile.subheading}
                >
                    <OutlinedButton onClick={() => navigate('/my-account')}>{t.quickActions.profile.button}
                        <Icon slot="icon" aria-hidden="true">{t.icons.arrowForward}</Icon>
                    </OutlinedButton>
                </sky-info-card>
                <sky-info-card
                    icon={t.quickActions.logout.icon}
                    heading={t.quickActions.logout.heading}
                    subheading={t.quickActions.logout.subheading}
                >
                    <FilledButton onClick={logout}>{t.quickActions.logout.button}
                        <Icon slot="icon" aria-hidden="true">{t.icons.logout}</Icon>
                    </FilledButton>
                </sky-info-card>
            </div>
        </div>
    );
}
export default CustomerDashboard;
