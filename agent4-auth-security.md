# Agent 4: Auth Security Audit — Roshani Rider React App

**Audit date:** 2026-07-14  
**Scope:** `roshani-rider-new/` — auth flow, session management, Firebase rules  
**Severity key:** 🔴 **CRITICAL** / 🟠 **HIGH** / 🟡 **MEDIUM** / 🔵 **LOW** / ✅ **OK**

---

## 1. Credential Storage — ✅ OK

No password stored in localStorage/sessionStorage. Firebase Auth SDK manages the ID/refresh token internally via IndexedDB (secure, HTTP-only equivalent isolation). localStorage keys used:

- `isLoggedIn` → boolean flag only, NOT a token
- `rider_authenticated` → boolean flag only
- `activeOrderId`, `activeOrderData` → session context, not credentials

**Files:** `authService.ts:49,71-74`  
**Risk:** None. Credentials never touch persistent web storage.

---

## 2. Session Persistence / Race — ✅ OK (with caveat)

`wasPreviouslyLoggedIn()` → `localStorage.getItem("isLoggedIn") === "true"` — used only as a UI hint to suppress the loading spinner flash (`AuthGuard.tsx:10`). The real auth gate is Firebase's `onAuthStateChanged`, which validates the session server-side via the SDK-managed token in IndexedDB.

**Race:** If the Firebase token expired while the app was closed, `hadPriorSession=true` briefly, then `onAuthStateChanged` fires `null`, routing to `LoginPage`. The localStorage flag is stale but harmless — it only controls a loading spinner, never grants access.

```
AuthGuard.tsx:10-11    — hadPriorSession skips spinner only
AuthContext.tsx:28     — useState(wasPreviouslyLoggedIn()) is static
```

**Risk:** None. Server-enforced auth is the gate.

---

## 3. Token Refresh / Mid-Session Expiry — 🟡 MEDIUM

Firebase Auth SDK auto-refreshes ID tokens. If the refresh fails (token revoked, account disabled), `onAuthStateChanged` fires `null`, routing to `LoginPage`. This is handled.

**Gap:** No global error boundary for individual Firebase DB calls that fail with permission errors during the window between token-expiry and `onAuthStateChanged(null)`. If the SDK has not yet detected the expiry, individual writes (order status updates, location sync) fail silently with no user feedback.

```
authService.ts:94-96   — subscribeAuthState relies on SDK detection
                       — no onError handler per call
```

**Recommendation:** Add a centralized Firebase generic/permission-denied error handler that triggers an auth reset toast + redirect. File: `src/lib/firebase.ts` or a middleware wrapper.

---

## 4. Logout Completeness — 🟡 MEDIUM

`logoutRider()` clears 4 localStorage keys + calls `firebaseSignOut` + sets `status: "Offline"`:

```
authService.ts:59-78
  ✓ localStorage.removeItem("isLoggedIn")
  ✓ localStorage.removeItem("rider_authenticated")
  ✓ localStorage.removeItem("activeOrderId")
  ✓ localStorage.removeItem("activeOrderData")
  ✓ status: "Offline", lastSeen: serverTimestamp()
  ✓ firebaseSignOut(auth)
```

**Gap:** `armDisconnectHandlers` (called at `AuthContext.tsx:34`) is never explicitly unregistered. When `firebaseSignOut` closes the Realtime DB connection, the onDisconnect handlers fire automatically (setting `status: Offline` — harmless). But if the user re-logs in quickly, a brief race exists where the old onDisconnect is still armed on the old path while new handlers are armed.

Additionally, `armDisconnectHandlers` is re-armed every time `onAuthStateChanged` fires with a user — including on every page focus/refresh — creating duplicate onDisconnect registrations.

**Recommendation:** Track the disconnect handler registration and cancel it before re-arming or on logout. Store the return value of `onDisconnect(...).update(...)` (it returns a `Promise<void>` but can be cancelled by reconnecting).

---

## 5. onDisconnect Timing — ✅ OK

Armed at `AuthContext.tsx:34` — inside `onAuthStateChanged` callback, only when `u` (user) is truthy:

```typescript
if (u) armDisconnectHandlers(u.uid);
```

This is the correct lifecycle point — the user is confirmed authenticated by Firebase. No race with login because the handler is armed before any DB writes.

**Logout race:** `firebaseSignOut` drops the connection → onDisconnect fires → sets `status: Offline`. No data loss or security gap.

**Location tracking disconnect:** `locationService.ts:50` also arms an onDisconnect for the location sub-path — redundant with `authService.ts:87-91` but harmless (both paths get cleaned up). The location-specific one writes `{ signalLost: true }` which is useful.

---

## 6. App Check — 🟡 MEDIUM

reCAPTCHA v3 is initialized at `firebase.ts:61-69`:

```typescript
try {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(...), isTokenAutoRefreshEnabled: true });
} catch (err) {
  console.warn("[App Check] Failed — continuing without it", err);
}
```

The try/catch silently degrades. An attacker who can cause the App Check initialization to fail (e.g., blocking the reCAPTCHA script, running in a headless browser without reCAPTCHA support, MITM that returns a bogus reCAPTCHA response) will bypass App Check entirely.

**Impact:** Without App Check, an attacker can call Firebase APIs from outside the app. Combined with the `isAdmin` vulnerability (finding #9), this enables full admin access without the legitimate app.

**Recommendation:** Add a configuration flag that gates whether the app continues without App Check. In production builds, show a hard error screen. At minimum, consider forcing App Check via `FirebaseError` on failure.

---

## 7. FCM Token — 🔵 LOW

`registerPushNotifications()` (`notificationService.ts:56-87`) writes the FCM token to `riders/{uid}/fcmToken` via `updateFcmToken`.

**Never called:** `registerPushNotifications` is exported but **never invoked** anywhere in the app. The FCM token is never persisted to the rider profile. Push notifications will not work at all unless backend logic is handling FCM via another mechanism.

```
grep found only definition, zero call sites
```

**Legacy comparison:** Old `rider/app.js` does NOT handle FCM either (no `firebase/messaging` import). So this is neutral relative to the old app, but the function exists dead code.

**Recommendation:** Either wire `registerPushNotifications` into the login flow (`AuthContext` or `RiderContext` on mount), or remove the dead code. If wired: note that FCM tokens are never revoked on logout — a logged-out rider could still receive push notifications. Add token revocation to `logoutRider`.

---

## 8. Rate Limiting — ✅ OK

No client-side rate limiting on login (`LoginForm.tsx`). The form disables the submit button while loading (`submitting` state), but this is UX-only and trivially bypassed by removing the `disabled` attribute.

**Mitigation:** Firebase Auth enforces server-side rate limiting (`auth/too-many-requests`). The error mapping correctly collapses to a generic message:

```
authService.ts:35-36
  case "auth/too-many-requests":
    return "Too many failed attempts. Try again later.";
```

**Risk:** Low. An attacker can submit many login requests but Firebase enforces the rate limit on the backend. No resource exhaustion concern for a rider app.

---

## 9. isAdmin Privilege Escalation — 🔴 CRITICAL

### The Vulnerability

A rider can write `{ isAdmin: true }` to their own Firebase profile and gain admin-equivalent privileges.

**Firebase rules** (`database.rules.json:13-14`):
```json
"riders": {
  "$uid": {
    ".write": "auth != null && (auth.uid == $uid || root.child('admins').child(auth.uid).exists())",
```

The `.write` rule allows `auth.uid == $uid` — riders can write ANY field to their own node. There is **no `.validate` rule rejecting the `isAdmin` field**. The only validation is:

```json
".validate": "newData.hasChildren(['name', 'phone']) || data.exists()"
```

On update, `data.exists()` is `true`, so the validation passes regardless of what fields are written.

### How It's Used

- **`Rider` type** (`types/index.ts:22`) includes `isAdmin: boolean`
- **`ActiveTripView.tsx:191`** passes `isAdmin: rider?.isAdmin` to `verifyOtpService`
- **`OTPSheet.tsx:163`** conditionally renders the "Emergency Override" button based on `isAdmin`
- **Old app** (`rider/app.js:348,496`) gates an emergency button and emergency functions behind `isAdmin`
- **Order service** (`orderService.ts:386,422`): `isAdmin` is received but `void isAdmin` — the actual fallback logic does NOT require `isAdmin`. The UI gating is the security boundary, and that reads from the rider profile which the rider controls.

**Attack scenario:**
1. Rider opens browser console
2. Runs: `firebase.database().ref('riders/'+auth.currentUser.uid+'/isAdmin').set(true)`
3. Rider profile now has `isAdmin: true`
4. Rider sees and can trigger the admin emergency override in the UI

**Impact:** Emergency override (OTP bypass via backup code) becomes accessible to any rider. Combined with the App Check bypass (finding #6), an external attacker could also exploit this.

**Fix:** Add a `.validate` rule on `riders/$uid` that **rejects writes to `isAdmin`**:

```json
"isAdmin": {
  ".validate": "!newData.exists() || newData.val() === data.val()"
}
```

Or better: move `isAdmin` to the `admins` node entirely and require `root.child('admins').child(auth.uid).exists()` for reads. Never store admin status on a rider-writable node.

---

## 10. Rider Enumeration — ✅ OK

`mapAuthError` (`authService.ts:31-33`) collapses three Firebase Auth error codes to the **same generic message**:

```typescript
case "auth/invalid-credential":
case "auth/wrong-password":
case "auth/user-not-found":
  return "Incorrect mobile number or password.";
```

An attacker cannot distinguish between:
- The phone number does not correspond to any Firebase Auth user
- The user exists but the password is wrong

**Risk:** None. Error messages are safe against enumeration.

---

## Summary

| # | Finding | Severity | File:Line | Fix |
|---|---------|----------|-----------|-----|
| 1 | No credential storage in web storage | ✅ OK | `authService.ts:49,71-74` | — |
| 2 | localStorage flag is UX hint only | ✅ OK | `AuthContext.tsx:28` | — |
| 3 | No global handler for mid-session token expiry | 🟡 MEDIUM | `authService.ts:94-96` | Add global permission-denied handler |
| 4 | onDisconnect never explicitly cancelled on logout | 🟡 MEDIUM | `authService.ts:81-91`, `AuthContext.tsx:34` | Track and cancel disconnect handlers before re-arming |
| 5 | onDisconnect timing correct | ✅ OK | `AuthContext.tsx:34` | — |
| 6 | App Check silently degrades on failure | 🟡 MEDIUM | `firebase.ts:61-69` | Gate production on App Check; hard error on failure |
| 7 | `registerPushNotifications` never called | 🔵 LOW | `notificationService.ts:56` | Wire into login lifecycle or remove dead code |
| 8 | No client-side rate limiting (server-side covers it) | ✅ OK | `LoginForm.tsx:22-29` | — |
| 9 | **Rider can write `isAdmin: true` to own profile** | 🔴 **CRITICAL** | `database.rules.json:13-14`, `types/index.ts:22` | Add `.validate` rejecting `isAdmin` writes; move admin flag to `admins` node |
| 10 | Error messages collapse to generic — no enumeration | ✅ OK | `authService.ts:31-33` | — |

### Priority Actions

1. **🔴 CRITICAL — Fix `isAdmin` write escalation** (finding #9): Add Firebase rule validation to reject rider writes to `isAdmin`. This is the single highest-risk finding — it turns any rider into an admin.
2. **🟡 MEDIUM — Wire FCM lifecycle** (finding #7): Connect `registerPushNotifications` into login and add token revocation on logout.
3. **🟡 MEDIUM — Global auth error handler** (finding #3): Catch permission-denied errors across all DB calls and route to re-login.
4. **🟡 MEDIUM — onDisconnect cleanup** (finding #4): Explicitly cancel disconnect handlers on logout to prevent stale registrations.
