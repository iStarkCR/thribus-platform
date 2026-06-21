import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initTheme, initGlass, initAccent } from './hooks/useTheme';
import './styles/globals.css';

// Aplica tema persistido ANTES de montar o React (evita flash de tema errado)
initTheme();
initGlass();
initAccent();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
