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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  if (payload?.notification?.title && payload?.notification?.body) {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: '/icon-512.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});