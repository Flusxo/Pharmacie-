import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './styles/app.css';
import './styles/public.css';
import './styles/pictures.css';
import './styles/glass.css';
import './styles/polish.css';
import { App } from './App';
import { warmUp } from './lib/apiBase';

// A sleeping free backend starts waking up now, not when the visitor first searches.
warmUp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
