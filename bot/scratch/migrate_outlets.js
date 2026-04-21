const { db, getData } = require('../firebase');

/**
 * Migration Script: Multi-Outlet Data Separation
 * 
 * This script moves legacy root-level data into outlet-prefixed nodes.
 * Structure: /${outlet}/${node}/${id}
 * 
 * Nodes to migrate:
 * - orders
 * - categories
 * - riders
 * - feedbacks
 * - metadata/orderSequence
 * - inventory
 * - riderStats
 */

const DRY_RUN = process.argv.includes('--dry-run');
const DEFAULT_OUTLET = 'pizza';

async function migrate() {
    console.log(`\n🚀 Starting Migration (Dry Run: ${DRY_RUN})\n`);

    const rootNodes = [
        'orders', 
        'categories', 
        'riders', 
        'feedbacks', 
        'inventory',
        'metadata/orderSequence',
        'riderStats',
        'dishes'
    ];

    const updates = {};
    const stats = {};

    for (const nodePath of rootNodes) {
        console.log(`📦 Processing node: /${nodePath}`);
        const data = await getData(nodePath);
        
        if (!data) {
            console.log(`   - No data found for /${nodePath}`);
            continue;
        }

        stats[nodePath] = { count: 0, byOutlet: {} };

        // metadata/orderSequence is a special case (nested by date)
        if (nodePath === 'metadata/orderSequence') {
            for (const dateStr in data) {
                const count = data[dateStr];
                const newPath = `${DEFAULT_OUTLET}/metadata/orderSequence/${dateStr}`;
                updates[newPath] = count;
                updateStats(stats[nodePath], DEFAULT_OUTLET);
            }
            continue;
        }

        // dishes is a special case (nested by outlet already)
        if (nodePath === 'dishes') {
            for (const outletKey in data) {
                const outletDishes = data[outletKey];
                const newPath = `${outletKey}/dishes`;
                updates[newPath] = outletDishes;
                updateStats(stats[nodePath], outletKey);
            }
            continue;
        }

        // Standard nodes
        for (const id in data) {
            const record = data[id];
            // Determine outlet
            let rawOutlet = (record.outlet || DEFAULT_OUTLET).toLowerCase();
            let outlet = rawOutlet;
            
            // Normalization
            if (outlet.includes('pizza')) outlet = 'pizza';
            if (outlet.includes('cake')) outlet = 'cake';

            const newPath = `${outlet}/${nodePath}/${id}`;
            updates[newPath] = record;
            updateStats(stats[nodePath], outlet);
        }
    }

    // Special case: liveTracker (nested by rider UID)
    // We need to know which rider belongs to which outlet
    console.log(`📦 Processing node: /liveTracker`);
    const riders = await getData('riders');
    const liveTracker = await getData('liveTracker');
    if (liveTracker && riders) {
        stats['liveTracker'] = { count: 0, byOutlet: {} };
        for (const riderUid in liveTracker) {
            const riderNode = riders[riderUid];
            const outlet = (riderNode?.outlet || DEFAULT_OUTLET).toLowerCase();
            const newPath = `${outlet}/liveTracker/${riderUid}`;
            updates[newPath] = liveTracker[riderUid];
            updateStats(stats['liveTracker'], outlet);
        }
    }

    console.log('\n📊 Migration Summary:');
    console.table(Object.keys(stats).map(node => ({
        Node: node,
        Total: stats[node].count,
        ...stats[node].byOutlet
    })));

    if (DRY_RUN) {
        console.log('\n✨ DRY RUN COMPLETE. No data was written.');
        console.log(`Would perform ${Object.keys(updates).length} operations.`);
    } else {
        if (Object.keys(updates).length === 0) {
            console.log('\n✅ No data found to migrate.');
            return;
        }
        console.log(`\n💾 Writing ${Object.keys(updates).length} records to Firebase...`);
        try {
            await db.ref().update(updates);
            console.log('✅ Migration Successful!');
        } catch (err) {
            console.error('❌ Migration Failed:', err.message);
        }
    }
}

function updateStats(nodeStat, outlet) {
    nodeStat.count++;
    nodeStat.byOutlet[outlet] = (nodeStat.byOutlet[outlet] || 0) + 1;
}

migrate().then(() => process.exit());
