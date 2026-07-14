// === src/services/auditService.ts ===
import { db, ref, set, serverTimestamp } from "@/lib/firebase";
import { dbPaths } from "@/lib/constants";

export async function logRiderError(riderId: string, context: string, error: unknown): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack || "" : "";
    const key = Date.now().toString();
    await set(ref(db, `${dbPaths.riderErrors(riderId)}/${key}`), {
      context,
      message,
      stack,
      timestamp: serverTimestamp(),
      url: typeof window !== "undefined" ? window.location.href : "",
    });
  } catch {
    // Logging must never throw and interrupt the rider's actual flow.
    console.error(`[audit] failed to log error for ${context}`);
  }
}
