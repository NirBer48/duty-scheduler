import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { I18nProvider } from './util/i18n';

const theme = createTheme({
  direction: 'ltr',
  palette: { mode: 'light' }
});

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <I18nProvider>
      <App />
    </I18nProvider>
  </ThemeProvider>
);
