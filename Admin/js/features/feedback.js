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
            const dateStr = f.timestamp ? new Date(f.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : "N/A";

            return `
                <tr class="premium-row-v4">
                    <td data-label="Date">
                        <div class="identity-info-v4">
                            <span class="name">${escapeHtml(dateStr)}</span>
                            <span class="sub">Log Time</span>
                        </div>
                    </td>
                    <td data-label="Order ID">
                        <div class="identity-chip-v4">
                            <div class="kpi-icon-box glass" style="width:32px; height:32px; font-size:14px;">
                                <i data-lucide="hash"></i>
                            </div>
                            <span class="name">#${escapeHtml(f.orderId || 'N/A')}</span>
                        </div>
                    </td>
                    <td data-label="Customer">
                        <div class="identity-info-v4">
                            <span class="name">${escapeHtml(f.customerName || 'Guest')}</span>
                            <span class="sub">${escapeHtml(f.phone || 'Anonymous')}</span>
                        </div>
                    </td>
                    <td data-label="Rating">
                        <div class="flex-col">
                            <span class="fs-14">${stars}</span>
                            <span class="text-muted-small">${f.rating}/5 Score</span>
                        </div>
                    </td>
                    <td data-label="Feedback">
                        <div class="flex-col">
                            <span class="font-600 color-primary fs-13">${escapeHtml(f.reason || f.feedback || 'General Rating')}</span>
                            ${f.comment ? `<span class="text-muted-small italic">"${escapeHtml(f.comment)}"</span>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        tableBody.innerHTML = feedbackHTML;
        if (window.lucide) window.lucide.createIcons({ root: tableBody });
    });
}

/**
 * CLEANUP FEEDBACK LISTENERS
 */
export function cleanupFeedbacks() {
    console.log("[Performance] Cleaning up Feedback listeners...");
    Outlet.ref("feedbacks").off();
}
