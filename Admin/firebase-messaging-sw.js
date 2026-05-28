importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDcx-SN5eak8PAs-8NtTGelJ_sICr5yb7Y",
  authDomain: "prashant-pizza-e86e4.firebaseapp.com",
  databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
  projectId: "prashant-pizza-e86e4",
  messagingSenderId: "857471482885",
  appId: "1:857471482885:web:9eb8bbb90c77c588fbb06c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title || 'New Order Alert';
  const notificationOptions = {
    body: payload.notification.body || 'Open dashboard to view details.',
    icon: './icon-512.png',
    badge: './icon-512.png',
    data: { url: './index.html' }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './index.html';
  event.waitUntil(
    clients.openWindow(targetUrl)
  );
});
