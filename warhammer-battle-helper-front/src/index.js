import React from 'react';
import ReactDOM from 'react-dom/client';
// Fonts are bundled and served from our own origin. Loading them from fonts.googleapis.com
// would send every visitor's IP address to Google before they answer the consent banner.
// Only the weights and styles the UI uses are imported; each file covers latin + latin-ext
// (Polish diacritics) through unicode-range, so the browser fetches just the subsets it needs.
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/400-italic.css';
import '@fontsource/crimson-text/600.css';
import '@fontsource/crimson-text/600-italic.css';
import '@fontsource/crimson-text/700.css';
import '@fontsource/crimson-text/700-italic.css';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
// Theme tokens first: every stylesheet below reads its colours, fonts and radii from them.
import './theme/tokens.css';
// Theme blocks only apply under <html data-theme="…">, set while a game view is open.
import './theme/themes/scifi.css';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import './style.css';
import './i18n';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
