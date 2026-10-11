import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root was not found in index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Install the offline service worker for real visits only. During `npm run dev`
 * a cached shell would serve stale modules and fight HMR, so it is skipped.
 * Test the installable/offline build with `npm run build && npm run preview`.
 */
if (import.meta.env.PROD) {
  void registerServiceWorker();
}
