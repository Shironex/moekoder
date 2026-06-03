import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Side-effect import: builds the i18next instance and picks the initial
// language synchronously. Ordered before `./App` so i18next is fully
// initialized before any component module evaluates — `t()` is ready on
// first paint and any future module-scope translation lookup stays safe.
import './lib/i18n';
import { App } from './App';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
