import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadShippedProject } from './model/shipped';
import { App } from './ui/App';
import './ui/styles.css';

// Snapshot the shipped catalogs before anything can rewrite the editor's copy
// of them (test play and previews install the draft into those records).
loadShippedProject();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
