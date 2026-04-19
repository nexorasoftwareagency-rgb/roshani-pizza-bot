const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Path to service account
const serviceAccountPath = path.join(__dirname, '..', 'bot', 'service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
    console.error('Service account file not found at:', serviceAccountPath);
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Use environment variables for sensitive data
const emailsRaw = process.env.TARGET_EMAILS;
const newPassword = process.env.NEW_PASSWORD;

if (!emailsRaw || !newPassword) {
    console.error('ERROR: TARGET_EMAILS and NEW_PASSWORD environment variables are required.');
    process.exit(1);
}

// Validation: Password complexity
if (newPassword.length < 8) {
    console.error('ERROR: NEW_PASSWORD must be at least 8 characters long.');
    process.exit(1);
}

const emails = emailsRaw.split(',').map(e => e.trim()).filter(e => e.length > 0);

async function updatePasswords() {
    console.log('--- Starting Password Update ---');
    let hadFailures = false;

    for (const email of emails) {
        try {
            const user = await admin.auth().getUserByEmail(email);
            await admin.auth().updateUser(user.uid, {
                password: newPassword
            });
            console.log(`Successfully updated password for: ${email} (UID: ${user.uid})`);
        } catch (error) {
            console.error(`Error updating password for ${email}:`, error.message);
            hadFailures = true;
        }
    }
    
    console.log('--- Password Update Complete ---');
    process.exit(hadFailures ? 1 : 0);
}

updatePasswords();
