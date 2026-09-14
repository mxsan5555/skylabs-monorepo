import { useNavigate } from 'react-router-dom';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import content from '../../../content.json';
import './not-found.css';

/** 404 page. Rendered by the catch-all route inside the public layout. */
export function NotFound() {
  const navigate = useNavigate();
  const { notFound } = content;
  return (
    <div className="not-found">
     <title>{notFound.metaTitle}</title>
      <p className="not-found__code">404</p>
      <h1>{notFound.title}</h1>
      <p>{notFound.message}</p>
      <FilledButton onClick={() => navigate('/')}> {notFound.backToHome}</FilledButton>
    </div>
  );
}
export default NotFound;
