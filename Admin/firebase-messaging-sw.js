// Firebase Messaging Service Worker
// This file is required by Firebase SDK — it auto-registers from /firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDcx-SN5eak8PAs-8NtTGelJ_sICr5yb7Y",
  authDomain: "prashant-pizza-e86e4.firebaseapp.com",
  databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
  projectId: "prashant-pizza-e86e4",
  messagingSenderId: "857471482885",
  appId: "1:857471482885:web:9eb8bbb90c77c588fbb06c"
});

const fcmMessaging = firebase.messaging();

fcmMessaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'New Order Alert';
  const notificationOptions = {
    body: payload.notification?.body || 'Open dashboard to view details.',
    icon: './icon-erp-logo.jpeg',
    badge: './icon-erp-logo.jpeg',
    data: { url: './index.html' }
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
