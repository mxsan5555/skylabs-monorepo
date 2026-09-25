import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import '@skylabs-monorepo/shared-ui';
import App from './app/app';
import { PrerenderDataProvider, type PrerenderPayload } from './prerender-data/prerender-data';

export { loadCategoryData, loadHomeData, loadShellData } from './prerender-data/loaders';

/** Server render of one route. Styles are not imported here: the client bundle's CSS
 *  links are already in index.html. */
export function render(url: string, payload: PrerenderPayload): string {
  return renderToString(
    <StrictMode>
      <PrerenderDataProvider payload={payload}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </PrerenderDataProvider>
    </StrictMode>,
  );
}
