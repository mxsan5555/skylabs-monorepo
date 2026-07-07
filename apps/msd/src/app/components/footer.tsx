import { List, ListItem, Icon } from '@skylabs-monorepo/shared-ui/react';
/** App footer. Presentational; lives in the app since it pairs with the shell. */
export function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-grid">
        <div className="footer-column">
          <h3><Icon>help_center</Icon>Help Center</h3>
          <List>
            <ListItem href='/how-to-pay'>How to Pay</ListItem>
            <ListItem href='/delivery-info'>Delivery Info</ListItem>
            <ListItem href="/faqs">FAQs</ListItem>
            <ListItem href="/contact">Contact Support</ListItem>
          </List>
        </div>

        <div className="footer-column">
          <h3> <Icon>chart_data</Icon>Customer Information</h3>
          <List>
            <ListItem href='/about-us'>About Us</ListItem>
            <ListItem href='/list-your-business'>List Your Business</ListItem>
            <ListItem href='/contact'>Contact</ListItem>
            <ListItem href='/blog'>Blog</ListItem>
          </List>
        </div>

        <div className="footer-column">
          <h3> <Icon>privacy_tip</Icon>Security & privacy</h3>
          <List>
            <ListItem href='/terms-of-use'>Terms of Use</ListItem>
            <ListItem href='/privacy-policy'>Privacy Policy</ListItem>
            <ListItem href='/return-policy'>Return/Refund Policy</ListItem>
          </List>
        </div>

        <div className="footer-column">
          <h3> <Icon>spa</Icon>About Company</h3>
          <p className="footer-about">
            Discover the best spa, salon and wellness deals near you.
            Book instantly and enjoy premium experiences at unbeatable
            prices.
          </p>
          <div className="footer-stats">
            <div>
              <strong>50+</strong>
              <span>Partners</span>
            </div>

            <div>
              <strong>20+</strong>
              <span>Cities</span>
            </div>

            <div>
              <strong>24×7</strong>
              <span>Support</span>
            </div>
          </div>
        </div>
      </div>


      <div className="footer-bottom">
        © {new Date().getFullYear()} MSD
      </div>
    </footer>
  );
}
