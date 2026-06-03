/**
 * ROSHANI ERP | GLOBAL BOT-STATUS LISTENER
 * Monitors bot/{outlet}/status from Firebase and dispatches a
 * `botStatusChange` custom event so any component can react.
 */
import { Outlet } from './firebase.js';

if (!window.__botStatusInit) {
  window.__botStatusInit = true;

  let _statusListener = null;

  function _dispatch(online, lastSeen) {
    window._botOnline = online;
    window._botLastSeen = lastSeen;
    window.dispatchEvent(new CustomEvent('botStatusChange', {
      detail: { online, lastSeen }
    }));
  }

  function _attachListener() {
    if (_statusListener) { _statusListener(); _statusListener = null; }
    const outlet = window.state?.currentOutlet || 'pizza';
    try {
      const ref = Outlet.ref(`bot/${outlet}/status`);
      _statusListener = ref.on('value', (snap) => {
        const val = snap.val() || {};
        const seen = val.lastSeen || 0;
        const fresh = (Date.now() - seen) < 90 * 1000;
        const online = val.status === 'Online' && fresh;
        _dispatch(online, seen);
      }, (err) => {
        console.warn('[BotStatus] Listener error:', err);
        _dispatch(false, 0);
      });
    } catch (err) {
      console.warn('[BotStatus] Failed to attach listener:', err);
      _dispatch(false, 0);
    }
  }

  _attachListener();

  document.addEventListener('switchOutlet', () => {
    if (_statusListener) { _statusListener(); _statusListener = null; }
    setTimeout(_attachListener, 100);
  });
}
