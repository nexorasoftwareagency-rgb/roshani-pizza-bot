import { logAudit } from './utils.js';

async function testLogging() {
    console.log("Starting Logging Test...");
    try {
        await logAudit('TEST_EVENT', { 
            message: 'Manual logging test triggered by developer',
            timestamp: new Date().toISOString(),
            testId: Math.random().toString(36).substring(7)
        });
        console.log("✅ Logging Test Successful!");
    } catch (error) {
        console.error("❌ Logging Test Failed:", error);
    }
}

testLogging();
