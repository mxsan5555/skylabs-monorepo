import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { RequireAuth, RequirePermission, useAuth } from '@skylabs-monorepo/shared-auth/react';
import { PublicLayout } from './layouts/public-layout';
import { useShadowLinkNavigation } from '../hooks/use-shadow-link-navigation';
import { AuthLayout } from './layouts/auth-layout';
import { AdminLayout } from './layouts/admin-layout';
import { AdminPage } from './admin/admin-page';
import Home from './pages/home/home';
import NotFound from './pages/not-found/not-found';
import Showcase from './pages/showcase/showcase';
import Blog from './pages/blog/blog';
import BlogDetail from './pages/blog-detail/blog-detail';
import SignIn from './pages/sign-in/sign-in';
import Otp from './pages/otp/otp';
import { ChooseExperience } from './pages/choose-experience/choose-experience';
import Profile from './pages/account/profile';
import { MyProfileSettings } from './pages/account/settings/settings';
import Dashboard from './pages/account/dashboard';
import { RoleManagement } from './pages/account/roles/roles';
import { UserManagement } from './pages/account/users/users';
import { UserDetailPage } from './pages/account/users/user-detail-page';
import { RoleConflictsPage } from './pages/account/users/role-conflicts-page';
import { AuditLogs } from './pages/account/audit-logs/audit-logs';
import { MemberManagement } from './pages/account/members/members';
import { MemberNewPage } from './pages/account/members/member-new-page';
import { MemberDetailPage } from './pages/account/members/member-detail-page';
import { BranchFormPage } from './pages/account/members/branch-form-page';
import { DealFormPage } from './pages/account/members/deal-form-page';
import { TherapistFormPage } from './pages/account/members/therapist-form-page';
import { ProductFormPage } from './pages/account/members/product-form-page';
import { CustomerManagement } from './pages/account/customers/customers';
import { CustomerDetailPage } from './pages/account/customers/customer-detail-page';
import { CustomerOrderInvoicePage } from './pages/account/customers/customer-order-invoice-page';
import { BranchList } from './pages/account/members/branch-list';
import { DealList } from './pages/account/members/deal-list';
import { TherapistList } from './pages/account/members/therapist-list';
import { VendorBusinessProfile } from './pages/account/members/vendor-business-profile';
import { VendorBranchesDeals } from './pages/account/members/vendor-branches-deals';
import { VendorCustomers } from './pages/account/members/vendor-customers';
import { VendorTherapists } from './pages/account/members/vendor-therapists';
import { VendorDeals } from './pages/account/members/vendor-deals';
import { VendorProducts } from './pages/account/members/vendor-products';
import { CategoryManagement } from './pages/account/masters/categories';
import { PopularTagManagement } from './pages/account/masters/popular-tags';
import { PopularTreatmentManagement } from './pages/account/masters/popular-treatments';
import { PromotionManagement } from './pages/account/masters/promotions';
import { HomeHeroManagement } from './pages/account/masters/home-hero';
import { HomeHeroBuilder } from './pages/account/masters/home-hero-builder';
import { HomeTagSectionsManagement } from './pages/account/masters/home-tag-sections';
import { HomeTagSectionsStatePage } from './pages/account/masters/home-tag-sections-state';
import { HomeTagSectionsBuilder } from './pages/account/masters/home-tag-sections-builder';
import { BlogList } from './pages/account/cms/blog-list';
import { BlogDetailAdmin } from './pages/account/cms/blog-detail-admin';
import { BlogCategoriesList } from './pages/account/cms/blog-categories-list';
import { AboutUsPage } from './pages/account/cms/about-us';
import { ContactUsPage } from './pages/account/cms/contact-us';
import { FaqList } from './pages/account/cms/faq-list';
import { HowItWorksPage } from './pages/account/cms/how-it-works';
import { CareersPage } from './pages/account/cms/careers';
import { LegalPagesList } from './pages/account/cms/legal-pages-list';
import { SocialMediaList } from './pages/account/cms/social-media-list';
import { ProductManagement } from './pages/account/products/products';
import { OrderManagement } from './pages/account/orders/orders';
import { OrderDetailPage } from './pages/account/orders/order-detail-page';
import { Reports } from './pages/account/reports/reports';
import { AccountsOverviewPage } from './pages/account/accounts/accounts-overview';
import { CustomerPaymentsPage } from './pages/account/accounts/customer-payments';
import { MemberSettlementsPage } from './pages/account/accounts/member-settlements';
import { MemberSettlementDetailPage } from './pages/account/accounts/member-settlement-detail';
import { RefundsDisputesPage } from './pages/account/accounts/refunds-disputes';
import { MemberOrdersPage } from './pages/account/vendor-portal/member-orders-page';
import { VoucherVerificationPage } from './pages/account/vendor-portal/voucher-verification-page';
import { VendorCustomerDetailPage } from './pages/account/vendor-portal/vendor-customer-detail-page';
import { EarningsPayouts } from './pages/account/vendor-portal/earnings-payouts';
import { SystemSettingsPage } from './pages/account/system-settings/system-settings';
import { NotificationsPage } from './pages/account/notifications/notifications';
import Search from './pages/search/search';
import Category from './pages/category/category';
import { CategoriesIndex } from './pages/categories/categories';
import About from './pages/about/about';
import HelpCenter from './pages/help-center/help-center';
import Contact from './pages/contact/contact';
import Careers from './pages/careers/careers';
import { BecomeVendor } from './pages/become-vendor/become-vendor';
import HowItWorks from './pages/how-it-works/how-it-works';
import WebsitePage from './pages/website-page/website-page';
import { Orders } from './pages/orders/orders';
import { OrderDetail } from './pages/orders/order-detail';
import { Invoice } from './pages/invoice/invoice';
import DealDetail from './pages/deal-detail/deal-detail';
import { Cart } from './pages/cart/cart';
import Wishlist from './pages/wishlist/wishlist';
import Checkout from './pages/checkout/checkout';
import ProductListing from './pages/products/products';
import ProductDetail from './pages/product-detail/product-detail';
import VendorPage from './pages/vendor/vendor';
import { Therapists } from './pages/therapists/therapists';
import TherapistDetail from './pages/therapist-detail/therapist-detail';
import { MyAccountLayout } from './pages/my-account/my-account-layout';
import { MyAccountProfile } from './pages/my-account/profile';
import { MyAccountPayments } from './pages/my-account/payments';
import { ScrollToTop } from './components/ScrollToTop';
import CustomerDashboard from './pages/customer-dashboard/customer-dashboard';
import { Support } from './pages/support/support';
/**
 * `/account/members` serves three audiences under different permission keys: admins hold
 * `members:view`, vendor-role users hold `members:custom` (never `view` — that would also
 * unlock the admin "list every vendor" endpoint, see vendors.tsx's doc comment) plus the
 * narrower `vendor-portal:view` that only surfaces the "My Business" sidebar item.
 * `RequirePermission` only checks a single action, so this route needs its own small
 * OR-of-three-actions guard instead — kept local here rather than changing the shared
 * `RequirePermission` component used by every other route in the app.
 */

/** Old `/account/vendors/...` links (bookmarks, notification metadata) land on the members route. */
function LegacyMemberRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`${pathname.replace('/account/vendors', '/account/members')}${search}`} replace />;
}

function VendorsRouteGuard({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (!can('members', 'view') && !can('members', 'custom') && !can('vendor-portal.profile', 'view')) {
    return <Navigate to="/account/profile" replace />;
  }
  return <>{children}</>;
}

/**
 * `/account/orders/:orderId` — Bug 1 fix. The backend (`GET /orders/:id`) already correctly
 * scopes a vendor caller to their own order items (`scopeOrderItemsToVendor`), but the route used
 * to be gated on the bare `orders:view` permission alone, which a plain `vendor` role never holds
 * (only `vendor-portal.orders:*` — deliberately, so a member never gets the admin-wide "Orders"
 * sidebar node). That made the frontend guard STRICTER than the API it gates, silently bouncing a
 * member's own "View Order" click to `/account/profile`. Same OR-of-two-permissions shape
 * `orders.tsx`'s own "Change status" action already uses (`can('orders','status_change') ||
 * can('vendors','custom')`), mirroring the backend's `requireOrdersOrVendorSelf`.
 */
export function OrderDetailRouteGuard({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (!can('orders', 'view') && !can('vendors', 'custom')) {
    return <Navigate to="/account/profile" replace />;
  }
  return <>{children}</>;
}

function BranchFormPageRoute() {
  const { token } = useAuth();
  return <BranchFormPage token={token} />;
}

function DealFormPageRoute() {
  const { token } = useAuth();
  return <DealFormPage token={token} />;
}

function TherapistFormPageRoute() {
  const { token } = useAuth();
  return <TherapistFormPage token={token} />;
}

function ProductFormPageRoute() {
  const { token } = useAuth();
  return <ProductFormPage token={token} />;
}

export function AppRoutes() {
  useShadowLinkNavigation();
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          {/* ── Consumer storefront ── */}
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Search />} />
          {/* Customer catalogue — Category → Sub-category → Service/Product → Deal — backed by
            `GET /catalog/*`. `/categories` is the "browse all categories" entry point (formerly
            the marketplace route namespace, retired once this page absorbed its real-API data
            source). */}
          <Route path="/categories" element={<CategoriesIndex />} />
          <Route path="/category/:slug" element={<Category />} />
          <Route path="/category/:slug/:city" element={<Category />} />
          {/* `:slug` also accepts a legacy UUID (a bookmarked/shared pre-SEO link) — the backend
            resolves either; the page itself client-navigates to the canonical slug path once
            loaded (see DealDetail's own doc comment — this is NOT a server-issued redirect). */}
          <Route path="/deal/:slug" element={<DealDetail />} />
          <Route path="/products" element={<ProductListing />} />
          <Route path="/products/:slug" element={<ProductDetail />} />
          <Route path="/vendor/:slug" element={<VendorPage />} />
          {/* Therapist as an independent, directly browsable/purchasable entity — never reachable
            only via a Deal's page (see msd-api's Therapist schema doc comment). */}
          <Route path="/therapists" element={<Therapists />} />
          <Route path="/therapist/:slug" element={<TherapistDetail />} />
          {/* Cart / Wishlist / Checkout — plain PublicLayout children (Header+Footer, no sidebar),
            exactly as they worked before the Customer Sidebar fix. These are NOT part of the
            Customer Sidebar — they stay reachable from the existing Header cart/wishlist icons,
            same route, same page, same layout as always. */}
          <Route
            path="/cart"
            element={
              <RequireAuth>
                <Cart />
              </RequireAuth>
            }
          />
          <Route
            path="/wishlist"
            element={
              <RequireAuth>
                <Wishlist />
              </RequireAuth>
            }
          />
          <Route
            path="/checkout"
            element={
              <RequireAuth>
                <Checkout />
              </RequireAuth>
            }
          />

          {/* Customer account pages (Orders/Order Detail) — nested INSIDE PublicLayout so
            the site Header/Footer stay mounted around them, reusing the SAME existing
            `MyAccountLayout` (full sidebar: Profile & Addresses/Orders/Wishlist/Cart/
            Payment History/Invoices/Settings — see my-account-layout.tsx's NAV_ITEMS) that
            `/my-account/*` uses below, not a cut-down sidebar. `MyAccountLayout` itself never
            renders a header/footer, so nesting it here (inside PublicLayout) is what keeps
            Header, Footer, and the full sidebar all mounted together for these routes — the same
            component instance is reused a second time, unwrapped, for `/my-account/*` further
            down, exactly as it already was before any of this. Cart/Wishlist/Checkout
            deliberately stay OUTSIDE this block (see above) even though the sidebar's own
            NAV_ITEMS still links to them — clicking those links just navigates to the
            sidebar-less Cart/Wishlist routes above, same as clicking the Header icons. */}
          {/* Customer account pages WITH sidebar */}
          <Route
            element={
              <RequireAuth>
                <MyAccountLayout />
              </RequireAuth>
            }
          >
            <Route path="/my-dashboard" element={<CustomerDashboard />} />
            <Route path="/my-account" element={<MyAccountProfile />} />
            <Route path="/my-account/profile" element={<MyAccountProfile />} />
            <Route path="/my-account/payments" element={<MyAccountPayments />} />
            <Route path="/my-account/support" element={<Support />} />
            <Route
              path="/my-account/invoices"
              element={
                <AdminPage
                  title="Invoices"
                  subtitle="Module coming soon."
                />
              }
            />

            <Route
              path="/my-account/settings"
              element={
                <AdminPage
                  title="Settings"
                  subtitle="Module coming soon."
                />
              }
            />
            <Route path="/orders" element={<Orders />} />
            <Route path="/my-account/cart" element={<Cart />} />
            <Route path="/my-account/wishlist" element={<Wishlist />} />
          </Route>

          {/* =====================================================
              ORDER DETAIL — standalone storefront page
              NO MyAccountLayout / NO account sidebar
             ===================================================== */}
          <Route
            path="/orders/:id"
            element={
              <RequireAuth>
                <OrderDetail />
              </RequireAuth>
            }
          />

          {/* Invoice — standalone storefront page */}
          <Route
            path="/orders/:id/invoice"
            element={
              <RequireAuth>
                <Invoice />
              </RequireAuth>
            }
          />

          {/* ── Content pages ── */}
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/help-center" element={<HelpCenter />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/careers" element={<Careers />} />
          {/* Public, unauthenticated Vendor self-registration ("Become a Vendor") — the storefront
            counterpart of the admin "Add Vendor" wizard, see become-vendor.tsx's own doc
            comment. Linked from the footer's "Partner With Us" entry (content.json). */}
          <Route path="/become-member" element={<BecomeVendor />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          {/* One legal page component for the 4 fixed WebsitePage rows (see website-page.tsx). */}
          <Route path="/privacy" element={<WebsitePage page="privacy" />} />
          <Route path="/terms" element={<WebsitePage page="terms" />} />
          <Route path="/accessibility" element={<WebsitePage page="accessibility" />} />
          <Route path="/cookies" element={<WebsitePage page="cookies" />} />
          <Route path="/products/:slug" element={<ProductDetail />} />
          <Route path="/showcase" element={<Showcase />} />
          {/* ── Catch-all 404, inside the shell so it keeps header/footer. ── */}
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* ── "My Account" (Profile/Payments/Invoices/Settings) — MyAccountLayout used bare, on its
          own, exactly as before (no PublicLayout wrapper, no header/footer — see
          MyAccountLayout's own doc comment for why). This is the ORIGINAL, unmodified placement;
          the Orders block above just nests the same layout a second time, inside
          PublicLayout, for its own routes. ── */}

        {/* Auth screens use a minimal centered shell (no header/footer). */}
        <Route element={<AuthLayout />}>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/otp" element={<Otp />} />
          <Route
            path="/choose-experience"
            element={
              <RequireAuth>
                <ChooseExperience />
              </RequireAuth>
            }
          />
        </Route>

        {/* Authenticated console (after login / "My account"). Every leaf below
          `/account/dashboard` and `/account/profile` is additionally gated by
          the exact `${menuKey}:view` permission the server already filtered
          `bootstrap.menu` by — belt-and-suspenders, since msd-api re-checks on
          every request. A user lacking a permission is bounced to
          `/account/profile` (RequirePermission's default fallback). */}
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route path="/account" element={<Navigate to="/account/profile" replace />} />
          <Route
            path="/account/dashboard"
            element={
              <RequirePermission menuKey="dashboard">
                <Dashboard />
              </RequirePermission>
            }
          />
          <Route path="/account/profile" element={<Profile />} />

          <Route
            path="/account/customers"
            element={
              <RequirePermission menuKey="customers">
                <CustomerManagement />
              </RequirePermission>
            }
          />
          {/* One customer's own page: real routes (not tabs), same shape as Member Detail's
            `/account/members/:memberId`/`:section` below — see `customer-detail-page.tsx`'s own
            doc comment. The static `/account/customers` list route above always wins over this
            dynamic segment. */}
          <Route
            path="/account/customers/:customerId"
            element={
              <RequirePermission menuKey="customers">
                <CustomerDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/customers/:customerId/:section"
            element={
              <RequirePermission menuKey="customers">
                <CustomerDetailPage />
              </RequirePermission>
            }
          />
          {/* Customer-scoped Order Detail/Invoice — reuses the same `OrderDetailPage`/
            `CustomerOrderInvoicePage` the order-wide routes below use; `OrderDetailPage` itself
            layers the `:customerId` ownership check on top of `GET /orders/:id` (see its own doc
            comment). */}
          <Route
            path="/account/customers/:customerId/orders/:orderId"
            element={
              <RequirePermission menuKey="customers">
                <OrderDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/customers/:customerId/orders/:orderId/invoice"
            element={
              <RequirePermission menuKey="customers">
                <CustomerOrderInvoicePage />
              </RequirePermission>
            }
          />
          <Route path="/account/vendors" element={<LegacyMemberRedirect />} />
          <Route path="/account/vendors/*" element={<LegacyMemberRedirect />} />
          <Route
            path="/account/members"
            element={
              <VendorsRouteGuard>
                <MemberManagement />
              </VendorsRouteGuard>
            }
          />
          {/* Add member: the short form. Same route guard as /account/members; MemberNewPage itself
            checks the finer-grained `members:create` action and shows an empty state otherwise
            (the backend route is the real enforcement either way). */}
          <Route
            path="/account/members/new"
            element={
              <VendorsRouteGuard>
                <MemberNewPage />
              </VendorsRouteGuard>
            }
          />
          {/* One member's own page: status actions in the header and seven tabs, each tab its
            own URL (`:section`) so the back button and shared links land on the same tab.
            Admin only: MemberDetailPage checks `members:view` itself, and every API call it
            makes is permission-gated server-side. The static `new` route above wins over this
            dynamic segment. */}
          <Route
            path="/account/members/:memberId"
            element={
              <VendorsRouteGuard>
                <MemberDetailPage />
              </VendorsRouteGuard>
            }
          />
          <Route
            path="/account/members/:memberId/:section"
            element={
              <VendorsRouteGuard>
                <MemberDetailPage />
              </VendorsRouteGuard>
            }
          />
          {/* Branch add/edit — real pages, never a popup (see the branch-management design spec).
            The static `new` segment wins over the dynamic `:branchId` below it. */}
          <Route
            path="/account/members/:vendorId/branches/new"
            element={
              <VendorsRouteGuard>
                <BranchFormPageRoute />
              </VendorsRouteGuard>
            }
          />
          <Route
            path="/account/members/:vendorId/branches/:branchId"
            element={
              <VendorsRouteGuard>
                <BranchFormPageRoute />
              </VendorsRouteGuard>
            }
          />
          {/* Deal add/edit — same real-page pattern as Branch above, never a popup. The static
            `new` segment wins over the dynamic `:dealId` below it. */}
          <Route
            path="/account/members/:vendorId/deals/new"
            element={
              <VendorsRouteGuard>
                <DealFormPageRoute />
              </VendorsRouteGuard>
            }
          />
          <Route
            path="/account/members/:vendorId/deals/:dealId"
            element={
              <VendorsRouteGuard>
                <DealFormPageRoute />
              </VendorsRouteGuard>
            }
          />
          {/* Therapist add/edit — same real-page pattern as Branch/Deal above, never a popup.
            The static `new` segment wins over the dynamic `:therapistId` below it. */}
          <Route
            path="/account/members/:vendorId/therapists/new"
            element={
              <VendorsRouteGuard>
                <TherapistFormPageRoute />
              </VendorsRouteGuard>
            }
          />
          <Route
            path="/account/members/:vendorId/therapists/:therapistId"
            element={
              <VendorsRouteGuard>
                <TherapistFormPageRoute />
              </VendorsRouteGuard>
            }
          />
          {/* Product add/edit — same real-page pattern as Branch/Deal/Therapist above, never a
            popup. The static `new` segment wins over the dynamic `:productId` below it. */}
          <Route
            path="/account/members/:vendorId/products/new"
            element={
              <VendorsRouteGuard>
                <ProductFormPageRoute />
              </VendorsRouteGuard>
            }
          />
          <Route
            path="/account/members/:vendorId/products/:productId"
            element={
              <VendorsRouteGuard>
                <ProductFormPageRoute />
              </VendorsRouteGuard>
            }
          />
          {/* Self-service split of the old combined "My Business" page — "Business Profile" and
            "Branches & Deals" as two distinct nav items, both gated by `vendor-portal:view`
            (the same narrow permission that used to gate the single combined page, granted
            only to the `vendor` role — see vendors.tsx's `VendorsRouteGuard` doc comment). */}
          <Route
            path="/account/vendor-profile"
            element={
              <RequirePermission menuKey="vendor-portal.profile">
                <VendorBusinessProfile />
              </RequirePermission>
            }
          />
          <Route
            path="/account/vendor-branches-deals"
            element={
              <RequirePermission menuKey="vendor-portal.branches">
                <VendorBranchesDeals />
              </RequirePermission>
            }
          />
          {/* Vendor-facing flat "Deals / Packages" — same `vendor-portal:view` permission, same
            underlying deals data as "Branches" above, just merged across all of the vendor's
            branches into one table instead of one-branch-at-a-time. */}
          <Route
            path="/account/vendor-deals"
            element={
              <RequirePermission menuKey="vendor-portal.deals">
                <VendorDeals />
              </RequirePermission>
            }
          />
          {/* Vendor-facing Customers list — reuses `vendor-portal:view` too, so it's visible with
            zero seed.ts/permission changes (same one-permissionKey-many-nodes pattern as
            orders above). Data itself is scoped `members:custom` server-side. */}
          <Route
            path="/account/vendor-customers"
            element={
              <RequirePermission menuKey="vendor-portal.customers">
                <VendorCustomers />
              </RequirePermission>
            }
          />
          {/* Vendor-facing Therapists CRUD — reuses `vendor-portal:view` too (same one-permissionKey-
            many-nodes pattern as Customers above). Data itself is scoped `members:custom` server-side. */}
          <Route
            path="/account/vendor-therapists"
            element={
              <RequirePermission menuKey="vendor-portal.therapists">
                <VendorTherapists />
              </RequirePermission>
            }
          />
          {/* Vendor-facing "Product" — same self-service /vendors/me/products* routes
            (`members:custom`) the onboarding wizard's admin-on-behalf Products step already
            uses, just the ongoing-management surface. Never the read-only admin oversight
            `/account/products` page below. */}
          <Route
            path="/account/vendor-products"
            element={
              <RequirePermission menuKey="vendor-portal.products">
                <VendorProducts />
              </RequirePermission>
            }
          />
          {/* Vendor-facing "Orders" — a real 2-tab page (`MemberOrdersPage`): Order History
            (`<OrderManagement scope="member" />`, its GET/PATCH calls already force-scoped to the
            caller's own vendorId server-side — order.service.ts#listOrders) and Verify & Complete
            (voucher lookup + the backend-sourced Service Queue, `GET /vouchers/queue`). Replaces
            the old single-page `OrdersAndVerify`. Same route, no new menu node — the whole voucher
            router is gated `vendor-portal.orders:custom` server-side either way. */}
          <Route
            path="/account/vendor-orders"
            element={
              <RequirePermission menuKey="vendor-portal.orders">
                <MemberOrdersPage />
              </RequirePermission>
            }
          />
          {/* Resumable, step-based voucher verification detail page — reached from the Service
            Queue, the "Open Voucher" lookup, and the per-entitlement "Continue Verification"/
            "View Record" links on Order Details. `voucherCode` (not the entitlement's id) is the
            only identifier the voucher API accepts, is DB-unique and permanent. Gated
            `vendor-portal.orders:custom` — the same action key the whole `vouchers.routes.ts`
            router requires. */}
          <Route
            path="/account/vendor-orders/verify/:code"
            element={
              <RequirePermission menuKey="vendor-portal.orders" action="custom">
                <VoucherVerificationPage />
              </RequirePermission>
            }
          />
          {/* Member-scoped, read-only Customer Detail page — Bug 2 fix (no member-scoped customer
            page existed anywhere before this). Data comes from `GET /vendors/me/customers/:id`
            (gated `vendors:custom` server-side); no status-change actions (a member can't edit a
            customer). Reached from the Vendor Customers list and from a future "View Customer"
            link on Order Details. */}
          <Route
            path="/account/vendor-customers/:customerId"
            element={
              <RequirePermission menuKey="vendor-portal.customers">
                <VendorCustomerDetailPage />
              </RequirePermission>
            }
          />
          {/* "Earnings & Payouts" — repurposes the old "Payments" stub (see settlements.routes.ts
            / accounts routing for the Super-Admin equivalent); read-only for the member, no
            payout controls (those are super-admin-only, see member-settlement-detail.tsx). */}
          <Route
            path="/account/vendor-payments"
            element={
              <RequirePermission menuKey="vendor-portal.payments">
                <EarningsPayouts />
              </RequirePermission>
            }
          />
          <Route
            path="/account/vendor-reports"
            element={
              <RequirePermission menuKey="vendor-portal.reports">
                <AdminPage title="Reports" subtitle="Module coming soon." />
              </RequirePermission>
            }
          />
          {/* Accounts, Member Settlements & Purchase Verification (Super-Admin console) — see
            packages/shared-menu/src/msd-menu.json's "accounts" group for the exact routes/
            permissionKeys these mirror. */}
          <Route
            path="/account/accounts/overview"
            element={
              <RequirePermission menuKey="accounts.overview">
                <AccountsOverviewPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/accounts/customer-payments"
            element={
              <RequirePermission menuKey="accounts.customer-payments">
                <CustomerPaymentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/accounts/member-settlements"
            element={
              <RequirePermission menuKey="accounts.member-settlements">
                <MemberSettlementsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/accounts/member-settlements/:vendorId"
            element={
              <RequirePermission menuKey="accounts.member-settlements">
                <MemberSettlementDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/accounts/refunds-disputes"
            element={
              <RequirePermission menuKey="accounts.refunds-disputes">
                <RefundsDisputesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/branches"
            element={
              <RequirePermission menuKey="vendors.branches">
                <BranchList />
              </RequirePermission>
            }
          />
          <Route
            path="/account/deals"
            element={
              <RequirePermission menuKey="vendors.deals">
                <DealList />
              </RequirePermission>
            }
          />
          <Route
            path="/account/therapists"
            element={
              <RequirePermission menuKey="vendors.therapists">
                <TherapistList />
              </RequirePermission>
            }
          />
          <Route
            path="/account/orders"
            element={
              <RequirePermission menuKey="orders">
                <OrderManagement />
              </RequirePermission>
            }
          />
          {/* Order-wide Order Details — the same `OrderDetailPage` the customer-scoped route
            above uses, just without that route's extra ownership check (see that component's
            own doc comment). Reachable from the Orders list's "View" action and from a
            "New Order Received" notification click-through. */}
          <Route
            path="/account/orders/:orderId"
            element={
              <OrderDetailRouteGuard>
                <OrderDetailPage />
              </OrderDetailRouteGuard>
            }
          />
          <Route
            path="/account/products"
            element={
              <RequirePermission menuKey="products">
                <ProductManagement />
              </RequirePermission>
            }
          />
          {/* <Route
          path="/account/inventory"
          element={
            <RequirePermission menuKey="inventory">
              <AdminPage title="Inventory" subtitle="Module coming soon." />
            </RequirePermission>
          }
        /> */}
          <Route
            path="/account/reports"
            element={
              <RequirePermission menuKey="reports">
                <Reports />
              </RequirePermission>
            }
          />
          {/* The old `/account/payments` stub (permissionKey "payments") was removed — the
            "accounts" menu group above replaced it, per the approved plan's RBAC wiring section
            ("removes rather than duplicates it — nothing else references permissionKey:
            'payments'"). */}
          {/* No RequirePermission wrapper — every authenticated console user (Vendor or Superadmin
            alike) is entitled to their own notification inbox regardless of RBAC permissions;
            deliberately not in shared-menu's sidebar either, reachable only via the header
            bell's "View all notifications" link (see notification-bell.tsx). */}
          <Route path="/account/notifications" element={<NotificationsPage />} />
          <Route
            path="/account/masters/categories"
            element={
              <RequirePermission menuKey="masters.categories">
                <CategoryManagement scope="top" />
              </RequirePermission>
            }
          />

          <Route
            path="/account/masters/sub-categories"
            element={
              <RequirePermission menuKey="masters.sub-categories">
                <CategoryManagement scope="sub" />
              </RequirePermission>
            }
          />

          <Route
            path="/account/masters/deals"
            element={
              <RequirePermission menuKey="masters.deals">
                <AdminPage title="Deals" subtitle="Module coming soon." />
              </RequirePermission>
            }
          />
          <Route
            path="/account/masters/tags"
            element={
              <RequirePermission menuKey="masters.tags">
                <PopularTagManagement />
              </RequirePermission>
            }
          />
          <Route
            path="/account/masters/popular-treatments"
            element={
              <RequirePermission menuKey="masters.popular-treatments">
                <PopularTreatmentManagement />
              </RequirePermission>
            }
          />
          <Route
            path="/account/masters/promotions"
            element={
              <RequirePermission menuKey="masters.promotions">
                <PromotionManagement />
              </RequirePermission>
            }
          />
          <Route
            path="/account/masters/home-hero"
            element={
              <RequirePermission menuKey="masters.home-hero">
                <HomeHeroManagement />
              </RequirePermission>
            }
          />
          <Route
            path="/account/masters/home-hero/:state"
            element={
              <RequirePermission menuKey="masters.home-hero">
                <HomeHeroBuilder />
              </RequirePermission>
            }
          />
          <Route
            path="/account/masters/home-tag-sections"
            element={
              <RequirePermission menuKey="masters.home-tag-sections">
                <HomeTagSectionsManagement />
              </RequirePermission>
            }
          />
          <Route
            path="/account/masters/home-tag-sections/:state"
            element={
              <RequirePermission menuKey="masters.home-tag-sections">
                <HomeTagSectionsStatePage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/masters/home-tag-sections/:state/:tag"
            element={
              <RequirePermission menuKey="masters.home-tag-sections">
                <HomeTagSectionsBuilder />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/blog"
            element={
              <RequirePermission menuKey="cms.blog.pages">
                <BlogList />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/blog/articles"
            element={
              <RequirePermission menuKey="cms.blog.articles">
                <BlogList scope="articles" />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/blog/articles/:id"
            element={
              <RequirePermission menuKey="cms.blog.articles">
                <BlogDetailAdmin scope="articles" />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/blog/:id"
            element={
              <RequirePermission menuKey="cms.blog.pages">
                <BlogDetailAdmin />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/about-us"
            element={
              <RequirePermission menuKey="cms.about-us">
                <AboutUsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/contact-us"
            element={
              <RequirePermission menuKey="cms.contact-us">
                <ContactUsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/faq"
            element={
              <RequirePermission menuKey="cms.faq">
                <FaqList />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/blog-categories"
            element={
              <RequirePermission menuKey="cms.blog-category">
                <BlogCategoriesList />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/how-it-works"
            element={
              <RequirePermission menuKey="cms.how-it-works">
                <HowItWorksPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/careers"
            element={
              <RequirePermission menuKey="cms.careers">
                <CareersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/legal-pages"
            element={
              <RequirePermission menuKey="cms.website-pages">
                <LegalPagesList />
              </RequirePermission>
            }
          />
          <Route
            path="/account/cms/social-media"
            element={
              <RequirePermission menuKey="cms.social-media">
                <SocialMediaList />
              </RequirePermission>
            }
          />
          <Route
            path="/account/administration/roles"
            element={
              <RequirePermission menuKey="rbac.roles">
                <RoleManagement />
              </RequirePermission>
            }
          />
          <Route
            path="/account/administration/users"
            element={
              <RequirePermission menuKey="rbac.users">
                <UserManagement />
              </RequirePermission>
            }
          />
          <Route
            path="/account/administration/users/:userId"
            element={
              <RequirePermission menuKey="rbac.users">
                <UserDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/administration/users/:userId/:section"
            element={
              <RequirePermission menuKey="rbac.users">
                <UserDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/administration/role-conflicts"
            element={
              <RequirePermission menuKey="rbac.users" action="assign">
                <RoleConflictsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/account/administration/audit-logs"
            element={
              <RequirePermission menuKey="rbac.audit-logs">
                <AuditLogs />
              </RequirePermission>
            }
          />
          <Route
            path="/account/settings"
            element={
              <RequirePermission menuKey="settings">
                <MyProfileSettings />
              </RequirePermission>
            }
          />
          <Route
            path="/account/system-settings"
            element={
              <RequirePermission menuKey="system-settings">
                <SystemSettingsPage />
              </RequirePermission>
            }
          />
        </Route>
      </Routes>
    </>
  );
}
