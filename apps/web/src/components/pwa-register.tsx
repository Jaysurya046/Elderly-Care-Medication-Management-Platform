'use client';

import * as React from 'react';

export function PwaRegister() {
  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('Elder Care Service Worker registered successfully with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('Elder Care Service Worker registration failed:', err);
          });
      });
    }
  }, []);

  return null;
}
