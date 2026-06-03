#!/usr/bin/env node
/**
 * delete-pizza-data.js
 * ONE-TIME destructive operation. Wipes customer/order data from the
 * Pizza outlet. Cake outlet is untouched.
 *
 * Paths deleted (all under /pizza/):
 *   - orders                  (all order records)
 *   - customers               (all saved customer profiles)
 *   - metadata/orderSequence  (so next order starts at #1)
 *   - feedbacks               (pizza-specific customer feedback)
 *   - otpAttempts             (any in-flight rider OTP attempts)
 *
 * Idempotent: safe to re-run if a previous run was interrupted.
 * Audit: writes a 'PizzaDataWipe' entry to /logs/audit before deletion.
 *
 * Usage: node scripts/delete-pizza-data.js
 *        (will prompt for typed confirmation "DELETE PIZZA DATA")
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT = path.join(__dirname, '..', 'bot', 'service-account.json');
const DB_URL = 'https://prashant-pizza-e86e4-default-rtdb.firebaseio.com';
const OUTLET = 'pizza';

const TARGETS = [
    { path: 'orders',                 label: 'Order records' },
    { path: 'customers',              label: 'Customer profiles' },
    { path: 'metadata/orderSequence', label: 'Order ID counter' },
    { path: 'feedbacks',              label: 'Customer feedback' },
    { path: 'otpAttempts',            label: 'Rider OTP attempts' },
];

function initAdmin() {
    if (!fs.existsSync(SERVICE_ACCOUNT)) {
        console.error(`FATAL: service account not found at ${SERVICE_ACCOUNT}`);
        process.exit(1);
    }
    if (admin.apps.length) return admin.database();
    admin.initializeApp({
        credential: admin.credential.cert(require(SERVICE_ACCOUNT)),
        databaseURL: DB_URL
    });
    return admin.database();
}

async function countChildren(ref) {
    const snap = await ref.once('value');
    if (!snap.exists()) return 0;
    return Object.keys(snap.val()).length;
}

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, ans => {
            rl.close();
            resolve(ans);
        });
    });
}

async function main() {
    console.log('==================================================');
    console.log('  PIZZA OUTLET DATA WIPE - Roshani Pizza ERP');
    console.log('==================================================');
    console.log(`Database : ${DB_URL}`);
    console.log(`Outlet   : ${OUTLET}`);
    console.log(`Node     : ${process.version}`);
    console.log(`Hostname : ${os.hostname()}`);
    console.log('');

    const db = initAdmin();

    // 1. Audit log FIRST
    const auditRef = db.ref('logs/audit').push();
    const auditKey = auditRef.key;
    await auditRef.set({
        action: 'PizzaDataWipe',
        adminEmail: 'script:delete-pizza-data.js',
        timestamp: admin.database.ServerValue.TIMESTAMP,
        targets: TARGETS.map(t => `${OUTLET}/${t.path}`),
        nodeVersion: process.version,
        hostname: os.hostname(),
        completed: false
    });
    console.log(`[audit] wipe record created: /logs/audit/${auditKey}`);

    // 2. Count
    console.log('\n=== COUNTING TARGETS ===');
    const fullRefs = TARGETS.map(t => ({
        ...t,
        ref: db.ref(`${OUTLET}/${t.path}`),
        count: 0
    }));
    for (const t of fullRefs) {
        t.count = await countChildren(t.ref);
    }
    for (const t of fullRefs) {
        console.log(
            `  /${OUTLET}/${t.path.padEnd(28)} ${String(t.count).padStart(6)} record(s)  - ${t.label}`
        );
    }
    const total = fullRefs.reduce((s, t) => s + t.count, 0);
    console.log(`  ${''.padEnd(36)} ${String(total).padStart(6)} TOTAL`);

    // 3. Confirm
    if (total === 0) {
        console.log('\nNothing to delete - all target paths are already empty.');
        await auditRef.update({
            completed: true,
            completedAt: admin.database.ServerValue.TIMESTAMP,
            note: 'no-op: paths already empty'
        });
        console.log('[done] audit log updated.');
        process.exit(0);
    }

    console.log('\nThis will DELETE the above records PERMANENTLY from the Pizza outlet.');
    console.log('Cake outlet and all global nodes (admins, riders, bot, logs, etc.) are UNTOUCHED.');
    console.log('There is NO backup. The data cannot be recovered after this point.');

    const answer = await ask('\nType "DELETE PIZZA DATA" to confirm: ');
    if (answer.trim() !== 'DELETE PIZZA DATA') {
        console.log('Aborted. No changes made.');
        await auditRef.update({
            completed: false,
            aborted: true,
            abortedAt: admin.database.ServerValue.TIMESTAMP
        });
        process.exit(0);
    }

    // 4. Delete (idempotent, per-node error isolation)
    console.log('\n=== DELETING ===');
    const results = [];
    for (const t of fullRefs) {
        if (t.count === 0) {
            console.log(`  /${OUTLET}/${t.path.padEnd(28)}  (already empty, skipping)`);
            results.push({ path: t.path, count: 0, status: 'skipped' });
            continue;
        }
        try {
            await t.ref.remove();
            console.log(`  /${OUTLET}/${t.path.padEnd(28)}  deleted ${t.count} record(s) OK`);
            results.push({ path: t.path, count: t.count, status: 'deleted' });
        } catch (e) {
            console.error(`  /${OUTLET}/${t.path.padEnd(28)}  FAILED: ${e.message}`);
            results.push({ path: t.path, count: t.count, status: 'failed', error: e.message });
        }
    }

    const failed = results.filter(r => r.status === 'failed');
    const deleted = results.filter(r => r.status === 'deleted');
    const totalDeleted = deleted.reduce((s, r) => s + r.count, 0);

    // 5. Final audit
    await auditRef.update({
        completed: failed.length === 0,
        completedAt: admin.database.ServerValue.TIMESTAMP,
        results,
        totalDeleted
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Paths touched  : ${results.filter(r => r.status !== 'skipped').length}/${results.length}`);
    console.log(`Records deleted: ${totalDeleted}`);
    if (failed.length > 0) {
        console.log(`Failures       : ${failed.length} (re-run to retry; script is idempotent)`);
    }
    console.log(`Audit record   : /logs/audit/${auditKey}`);
    console.log('\n[done] Pizza outlet customer/order data wipe complete.');

    if (failed.length > 0) process.exit(1);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
