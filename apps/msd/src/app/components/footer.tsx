import { List, ListItem, IconButton, Icon } from '@skylabs-monorepo/shared-ui/react';
/** App footer. Presentational; lives in the app since it pairs with the shell. */
export function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-grid">
        <div className="footer-column">
          <h3>Help Center</h3>
          <List>
            <ListItem href='how-to-pay'>How to Pay</ListItem>
            <ListItem href='delivery-info'>Delivery Info</ListItem>
          </List>
        </div>

        <div className="footer-column">
          <h3>Customer Information</h3>
          <List>
            <ListItem href='about-us'>About Us</ListItem>
            <ListItem href='faqs'>FAQ's</ListItem>
            <ListItem href='list-your-business'>List Your Business</ListItem>
            <ListItem href='contact-us'>Contact Us</ListItem>
            <ListItem href='rss'>RSS</ListItem>
          </List>
        </div>

        <div className="footer-column">
          <h3>Security & privacy</h3>
          <List>
            <ListItem href='terms-of-use'>Term's of Use</ListItem>
            <ListItem href='privacy-policy'>Privacy Policy</ListItem>
            <ListItem href='return-policy'>Return/Refund Policy</ListItem>
          </List>
        </div>

        <div className="footer-column">
          <h3>About Company</h3>
          <p className="footer-about">
            MSD helps you discover the best deals- wherever you are!
            Make every day awesome with myspadeal
          </p>
          <div className="footer-social">
            <IconButton> <Icon>facebook</Icon> </IconButton>
            <IconButton><Icon>alternate_email</Icon></IconButton>
            <IconButton><Icon>business</Icon></IconButton>
          </div>
        </div>
      </div>


      <div className="footer-bottom">
        © {new Date().getFullYear()} MSD
      </div>
    </footer>
  );
}
