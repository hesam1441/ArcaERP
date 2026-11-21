import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {installAutomaticPrintFit} from './utils/automaticPrintFit';
import {installInputDirection} from './utils/inputDirection';
installAutomaticPrintFit(window);
const removeInputDirection = installInputDirection(document);
if (import.meta.hot) import.meta.hot.dispose(removeInputDirection);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
