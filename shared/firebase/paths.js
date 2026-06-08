/**
 * SHARED FIREBASE PATH RESOLVER — canonical global-nodes list.
 *
 * Usage (browser ESM):
 *   import { resolveOutletPath, GLOBAL_PATHS } from '../shared/firebase/paths.js';
 *
 * Usage (bot CJS): require('./shared/firebase/paths.js')
 */

/**
 * Paths that live at the database root (NOT under any outlet).
 * The union of Admin's list + Rider's list — this is the single source of truth.
 */
export const GLOBAL_PATHS = [
    'admins',
    'admins_list',
    'riders',
    'logs',
    'errorLogs',
    'bot',
    'migrationStatus'
];

/**
 * Resolve a relative path to its full Firebase path.
 * - If the first segment is in GLOBAL_PATHS, the path is returned as-is.
 * - Otherwise, `${outlet}/${path}` is returned.
 *
 * @param {string} path - Relative path (e.g. "orders/abc" or "admins/uid")
 * @param {string} outlet - Current outlet (default: "pizza")
 * @returns {string} Resolved path
 */
export function resolveOutletPath(path, outlet = 'pizza') {
    if (!path) return outlet;
    const clean = path.startsWith('/') ? path.slice(1) : path;
    const firstSegment = clean.split('/')[0];
    if (GLOBAL_PATHS.includes(firstSegment)) return clean;
    const target = (outlet || 'pizza').toLowerCase().trim();
    if (clean.startsWith(`${target}/`)) return clean;
    return `${target}/${clean}`;
}
