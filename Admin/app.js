/**
 * ROSHANI ERP | ADMIN CORE APPLICATION
 * [LEGACY ENTRY POINT]
 * 
 * All core logic has been moved to /js/*.js and /js/features/*.js
 * This file is now a minimal bridge for backward compatibility.
 */

// Import the new implementations
import { doLogin as adminLogin, userLogout } from './js/auth.js';

// Attach deprecation wrappers to window object
window.adminLogin = function() {
  console.warn("DEPRECATION: window.adminLogin is deprecated. Use the modular admin/js/auth.js instead.");
  return adminLogin.apply(this, arguments);
};

window.userLogout = function() {
  console.warn("DEPRECATION: window.userLogout is deprecated. Use the modular admin/js/auth.js instead.");
  return userLogout.apply(this, arguments);
};

console.log("🛠️ Admin Portal: Modular Architecture Active");