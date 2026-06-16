import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  SkyCardReact,
  SkyBadgeReact,
} from '@skylabs-monorepo/shared-ui/react';
import './home.css';

/**
 * Sample landing page. Demonstrates a page composed from shared-ui components
 * and themed by msd's palette. Real content/data arrives with the blog/contact
 * pages and the backend.
 */
export function Home() {
  const navigate = useNavigate();
  return (
    <div className="home">
      {/* React 19 hoists these to <head>. */}
      <title>MSD — Your wellness companion</title>
      <meta
        name="description"
        content="MSD, your wellness companion. Sign in to receive a one-time code and get started."
      />

      <section className="home__hero">
        <SkyBadgeReact>msd</SkyBadgeReact>
        <h1>Welcome to msd</h1>
        <p>
          A React app built on the shared Material 3 design system. Pages live
          here; reusable UI lives in <code>shared-ui</code>.
        </p>
        <div className="home__actions">
          <FilledButton onClick={() => navigate('/showcase')}>
            View component showcase
          </FilledButton>
          <OutlinedButton onClick={() => navigate('/blog')}>
            Read the blog
          </OutlinedButton>
        </div>
      </section>

      <section className="home__cards">
        <SkyCardReact variant="elevated">
          <h2>Reusable UI</h2>
          <p>Material Web + custom LIT components, themed per app.</p>
        </SkyCardReact>
        <SkyCardReact variant="outlined">
          <h2>App-owned pages</h2>
          <p>Routing, auth, and data stay native to each framework.</p>
        </SkyCardReact>
      </section>
    </div>
  );
}

export default Home;
