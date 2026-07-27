import { useNavigate } from 'react-router-dom';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import './not-found.css';

/** 404 page. Rendered by the catch-all route inside the public layout. */
export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="not-found">
      <title>Page not found · MSD</title>
      <p className="not-found__code">404</p>
      <h1>Page not found</h1>
      <p>The page you’re looking for doesn’t exist or has moved.</p>
      <FilledButton onClick={() => navigate('/')}>Back to home</FilledButton>
    </div>
  );
}

export default NotFound;
