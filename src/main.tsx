import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { KashProvider } from './state/KashProvider';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemento #root não encontrado');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <KashProvider>
        <App />
      </KashProvider>
    </BrowserRouter>
  </StrictMode>,
);
