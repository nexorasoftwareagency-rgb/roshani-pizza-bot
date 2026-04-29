/**
 * ROSHANI ERP | FEEDBACK MANAGEMENT MODULE
 * Handles customer feedback retrieval and rendering.
 */

import { Outlet } from '../firebase.js';
import { escapeHtml } from '../utils.js';

/**
 * INITIALIZE FEEDBACK LISTENERS
 */
export function loadFeedbacks() {
    const tableBody = document.getElementById("feedbackTableBody");
    if (!tableBody) return;

    // Detach previous to prevent duplicates
    cleanupFeedbacks();

    // Listen for new feedback
    Outlet.ref("feedbacks").on("value", snap => {
        tableBody.innerHTML = "";
        const feedbacks = [];
        snap.forEach(child => {
            feedbacks.push({ id: child.key, ...child.val() });
        });

        // Sort by date (desc)
        feedbacks.sort((a, b) => {
            const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            return dateB - dateA;
        });

        if (feedbacks.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No feedback received yet.</td></tr>`;
            return;
        }

        const feedbackHTML = feedbacks.map(f => {
            const stars = "⭐".repeat(f.rating || 0);
            const dateStr = f.timestamp ? new Date(f.timestamp).toLocaleString() : "N/A";

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03)">
                    <td data-label="Date" style="padding:15px; font-size:12px;">${escapeHtml(dateStr)}</td>
                    <td data-label="Order ID" style="padding:15px; font-family:monospace; font-weight:700;">#${escapeHtml(f.orderId || 'N/A')}</td>
                    <td data-label="Customer" style="padding:15px">
                        <div style="font-weight:700;">${escapeHtml(f.customerName || 'Guest')}</div>
                        <small style="color:var(--text-muted);">${escapeHtml(f.phone || '')}</small>
                    </td>
                    <td data-label="Rating" style="padding:15px; font-size:14px;">${stars}</td>
                    <td data-label="Feedback" style="padding:15px">
                        <div style="font-weight:600; color:var(--text-main);">${escapeHtml(f.reason || f.feedback || '')}</div>
                        ${f.comment ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-style:italic;">"${escapeHtml(f.comment)}"</div>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
        tableBody.innerHTML = feedbackHTML;
    });
}

/**
 * CLEANUP FEEDBACK LISTENERS
 */
export function cleanupFeedbacks() {
    console.log("[Performance] Cleaning up Feedback listeners...");
    Outlet.ref("feedbacks").off();
}
