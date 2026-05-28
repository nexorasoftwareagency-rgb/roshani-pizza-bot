export async function setupCapacitorFCM(userId) {
  if (typeof Capacitor === 'undefined') return;

  try {
    const { PushNotifications } = Capacitor.Plugins;
    if (!PushNotifications) return;

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') return;

    const result = await PushNotifications.register();
    const token = result?.value;
    if (!token) return;

    const db = firebase.database();
    await db.ref(`admins/${userId}`).update({ fcmToken: token });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const title = notification.title || 'New Alert';
      const body = notification.body || '';
      if (window.showToast) {
        window.showToast(`${title}: ${body}`, 'info');
      }
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data || {};
      if (data.url) {
        window.location.href = data.url;
      }
    });
  } catch (e) {
    console.error('[Capacitor FCM] Error:', e);
  }
}
