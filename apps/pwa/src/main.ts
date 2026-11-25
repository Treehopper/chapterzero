import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

if ('serviceWorker' in navigator && import.meta.env.PROD && !new URLSearchParams(location.search).has('nosw')) {
  // a home-screen app resumes from memory without a page load, so the service worker would only look for a new build
  // on a cold start: look again whenever the app comes to the front (autoUpdate then reloads into it)
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({
    immediate: true,
    onRegisteredSW: (_url, reg) => {
      if (!reg) return;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update().catch(() => {}); });
    },
  }));
}
