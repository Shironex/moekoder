import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Side-effect import: builds the i18next instance and picks the initial
// language synchronously, before React renders, so `t()` is ready on first paint.
import './lib/i18n';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
