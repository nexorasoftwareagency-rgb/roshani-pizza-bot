importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAAHuSGwulRO3QhrOD4zK3ZRISivBi7jOM",
  authDomain: "prashant-pizza-e86e4.firebaseapp.com",
  databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
  projectId: "prashant-pizza-e86e4",
  messagingSenderId: "857471482885",
  appId: "1:857471482885:web:9eb8bbb90c77c588fbb06c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Only show notification if notification data is present
  if (payload?.notification?.title && payload?.notification?.body) {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: '/icon-512.png'
    };
    
    self.registration.showNotification(notificationTitle, notificationOptions);
  }
  // Don't log entire payload to avoid exposing sensitive data
  console.log('[firebase-messaging-sw.js] Received background message');
});
