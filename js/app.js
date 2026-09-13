/**
 * app.js
 * Main entry point for the BlankMap application
 */

import { mapManager } from './map.js';
import { uiManager } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing BlankMap Studio...');
  mapManager.init('map');
  uiManager.init();

  // Register Service Worker for PWA (Android / Web)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('PWA ServiceWorker registered with scope:', reg.scope);
          // Check for updates on every launch
          reg.update();
        })
        .catch((err) => {
          console.warn('PWA ServiceWorker registration failed:', err);
        });
    });
  }
});
