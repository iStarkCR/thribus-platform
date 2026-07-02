import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initTheme, initGlass, initAccent, initFontScale } from './hooks/useTheme';
import { initFont } from './hooks/useFont';
import './styles/globals.css';

// Aplica tema persistido ANTES de montar o React (evita flash de tema errado)
initTheme();
initGlass();
initAccent();
initFontScale();
initFont();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
