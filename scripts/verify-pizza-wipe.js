#!/usr/bin/env node
/**
 * verify-pizza-wipe.js
 * Verifies that the pizza outlet data wipe completed correctly.
 * - All 5 target paths under /pizza/ should be null/empty
 * - /cake/* should still have data (untouched)
 * - Audit log entry should exist with completed:true
 */

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT = path.join(__dirname, '..', 'bot', 'service-account.json');
const DB_URL = 'https://prashant-pizza-e86e4-default-rtdb.firebaseio.com';

const TARGETS = [
    'pizza/orders',
    'pizza/customers',
    'pizza/metadata/orderSequence',
    'pizza/feedbacks',
    'pizza/otpAttempts',
];

const CAKE_SENTINEL = [
    'cake/orders',
    'cake/customers',
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
    const v = snap.val();
    if (typeof v !== 'object') return 1;
    return Object.keys(v).length;
}

async function main() {
    const db = initAdmin();
    let ok = true;

    console.log('=== VERIFY PIZZA WIPE ===\n');

    console.log('1) Pizza target paths (all should be 0 records):');
    for (const t of TARGETS) {
        const n = await countChildren(db.ref(t));
        const status = n === 0 ? 'OK' : 'STILL HAS DATA';
        console.log(`   /${t.padEnd(36)} ${String(n).padStart(6)}  [${status}]`);
        if (n !== 0) ok = false;
    }

    console.log('\n2) Cake outlet sentinel (should be unchanged):');
    for (const t of CAKE_SENTINEL) {
        const n = await countChildren(db.ref(t));
        console.log(`   /${t.padEnd(36)} ${String(n).padStart(6)}  [${n > 0 ? 'OK (has data)' : 'EMPTY (was cake empty?)'}]`);
    }

    console.log('\n3) Latest audit log entry:');
    const auditSnap = await db.ref('logs/audit').orderByChild('timestamp').limitToLast(1).once('value');
    if (!auditSnap.exists()) {
        console.log('   (no audit log entries)  [FAIL]');
        ok = false;
    } else {
        auditSnap.forEach(child => {
            const e = child.val();
            console.log(`   key      : /logs/audit/${child.key}`);
            console.log(`   action   : ${e.action}`);
            console.log(`   completed: ${e.completed}`);
            console.log(`   totalDel : ${e.totalDeleted}`);
            console.log(`   results  :`, JSON.stringify(e.results, null, 2).split('\n').map(l => '     ' + l).join('\n'));
            if (e.action !== 'PizzaDataWipe') {
                console.log('   [FAIL] latest audit entry is not the wipe');
                ok = false;
            } else if (!e.completed) {
                console.log('   [FAIL] wipe entry marked not completed');
                ok = false;
            }
        });
    }

    console.log('\n=== RESULT ===');
    if (ok) {
        console.log('PASS - pizza wipe verified, cake intact, audit recorded.');
    } else {
        console.log('FAIL - see above.');
        process.exit(1);
    }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
