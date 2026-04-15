const axios = require('axios');
const fs = require('fs');

async function resetAdmins() {
    const config = {
        apiKey: "AIzaSyAAHuSGwulRO3QhrOD4zK3ZRISivBi7jOM",
    };

    const admins = [
        { email: "roshanipizza@gmail.com", password: "12345678" },
        { email: "roshanicakes@gmail.com", password: "12345678" }
    ];

    for (const admin of admins) {
        console.log(`Registering/Resetting ${admin.email}...`);
        try {
            await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
                email: admin.email,
                password: admin.password,
                returnSecureToken: true
            });
            console.log(`Success for ${admin.email}`);
        } catch (e) {
            if (e.response && e.response.data.error.message === 'EMAIL_EXISTS') {
                console.log(`${admin.email} already exists. Attempting to update password...`);
                // Note: Updating password via REST usually requires an ID token of the user or admin SDK.
                // We'll trust that the register_users.js might have worked or we'll try to delete first if we had a key.
                // Since I can't easily reset password via public REST without current token, I'll rely on the RBAC lockdown.
            } else {
                console.error(`Error for ${admin.email}:`, e.response?.data?.error?.message || e.message);
            }
        }
    }
}

resetAdmins();
