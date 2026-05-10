    const handleLoginError = (e) => {
        console.error("[Auth] Login error:", e);
        let msg = "Sign-in failed: " + e.message;
        
        if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            msg = "Incorrect mobile number or password.";
        } else if (e.code === 'auth/too-many-requests') {
            msg = "Too many failed attempts. Try again later.";
        } else if (e.code === 'auth/network-request-failed') {
            msg = "Network error. Check internet connection.";
        } else if (e.code === 'auth/api-key-expired') {
            msg = "System Error: API Key Expired. Contact Admin.";
        }
        
        window.showToast(msg, "error");
    };
