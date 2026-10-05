import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon,} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCustomerDashboardSummary } from '../../../api/customer-dashboard';
import { ApiRequestError } from '../../../api/rbac/client';
import './customer-dashboard.css';

interface DashboardStats {
    deals: number;
    products: number;
    cart: number;
    wishlist: number;
}
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
            setError(
                err instanceof ApiRequestError? err.message: 'Could not load your dashboard.',
            );
        } finally {
            if (!cancelled) {
                setLoading(false);
            }
        }
    }

    loadDashboard();

    return () => {
        cancelled = true;
    };
}, [token]);
    const logout = () => {
        signOut();
        navigate('/sign-in', { replace: true });
    };

    if (loading) {
        return (
            <div className="customer-dashboard">
                <sky-info-card
                    icon="dashboard"
                    heading="Loading your dashboard"
                    subheading="Please wait..."
                />
            </div>
        );
    }

    return (
        <div className="customer-dashboard">
            <title>My Dashboard</title>

            <sky-feature-card
                className="customer-dashboard__hero"
                color="secondary"
                icon="dashboard"
                iconStyle="surface"
                variant="filled"
                iconShape="full"
                headline="My Dashboard"
                text="Welcome back. Manage your bookings, products, cart and wishlist from one place."
            />

            {error && (
                <sky-card className="customer-dashboard__error">
                    <div className="customer-dashboard__error-content">
                        <Icon aria-hidden="true">error_outline</Icon>
                        <span>{error}</span>
                    </div>
                </sky-card>
            )}
            <div className="customer-dashboard__stats">
                <sky-tile-card
                    icon="spa"
                    headline="Deals"
                    text={`${stats.deals} booked deals`}
                    variant="elevated"
                   href="/orders?type=SERVICE"
                />

                <sky-tile-card
                    icon="inventory_2"
                    headline="Products"
                    text={`${stats.products} purchased products`}
                    variant="elevated"
                    href="/orders?type=PRODUCT"
                />

                <sky-tile-card
                    icon="shopping_cart"
                    headline="Cart"
                    text={`${stats.cart} items in cart`}
                    variant="elevated"
                    href="/cart"
                />

                <sky-tile-card
                    icon="favorite"
                    headline="Wishlist"
                    text={`${stats.wishlist} saved items`}
                    variant="elevated"
                    href="/wishlist"
                />
            </div>
            <sky-card className="customer-dashboard__profile">
                <div className="customer-dashboard__section-content">
                    <div>
                        <h2>Profile</h2>
                        <p>
                            View and update your personal account information.
                        </p>
                    </div>

                    <OutlinedButton
                        onClick={() => navigate('/my-account')}
                    >
                        <Icon slot="icon" aria-hidden="true">
                            person
                        </Icon>
                        View Profile
                    </OutlinedButton>
                </div>
            </sky-card>

            <sky-card className="customer-dashboard__logout">
                <div className="customer-dashboard__section-content">
                    <div>
                        <h2>Logout</h2>
                        <p>
                            Sign out from your MySpaDeal account.
                        </p>
                    </div>

                    <FilledButton onClick={logout}>
                        <Icon slot="icon" aria-hidden="true">
                            logout
                        </Icon>
                        Logout
                    </FilledButton>
                </div>
            </sky-card>
        </div>
    );
}

export default CustomerDashboard;