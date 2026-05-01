/**
 * FIREBASE APP CHECK INITIALIZER
 * Separated to ensure it loads before any other modules.
 */
(function() {
    console.log("[App Check] Starting initialization...");
    let retries = 0;
    const MAX_RETRIES = 50; // 5 seconds at 100ms intervals
    const check = () => {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0 && firebase.appCheck && window.reCaptchaSiteKey) {
            try {
                const appCheck = firebase.appCheck();
                appCheck.activate(
                    new firebase.appCheck.ReCaptchaV3Provider(window.reCaptchaSiteKey),
                    true
                );
                console.log("[App Check] ✅ Activated Successfully");
            } catch (e) {
                console.warn("[App Check] ⚠️ Activation failed:", e);
            }
        } else if (retries < MAX_RETRIES) {
            retries++;
            if (retries % 10 === 0) console.warn(`[App Check] ⏳ Waiting for SDK/Config... (${retries}/${MAX_RETRIES})`);
            setTimeout(check, 100);
        } else {
            console.error("[App Check] ❌ Initialization failed: SDK or Recaptcha key not found after 5s.");
        }
    };
    check();
})();
