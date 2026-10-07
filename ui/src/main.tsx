import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { Toaster } from '@/components/ui/sonner.js';
import { UpdateNotifier } from '@/components/UpdateNotifier.js';
import { TooltipProvider } from '@/components/ui/tooltip.js';
import { I18nProvider } from './i18n/index.js';
import { ThemeProvider } from './theme.js';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <TooltipProvider>
          <App />
          <Toaster />
          <UpdateNotifier />
        </TooltipProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
