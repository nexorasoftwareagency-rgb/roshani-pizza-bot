/**
 * ROSHANI ERP | PROMOTIONS GUIDE
 * Renders a 6-step "How to use" article inside the guide modal.
 */

const STEPS = [
    {
        icon: 'edit-3',
        title: 'Compose',
        body: 'Write your message in the composer. Use tokens like <code>{name}</code>, <code>{phone}</code>, <code>{lastOrderDate}</code>, <code>{storeName}</code> and <code>{couponCode}</code> to personalize automatically.',
    },
    {
        icon: 'users',
        title: 'Pick recipients',
        body: 'Choose an audience (all consenting customers, last 30 days active, or upload a CSV). Customers who replied STOP to a previous message are excluded automatically.',
    },
    {
        icon: 'eye',
        title: 'Preview & Test',
        body: 'Click <strong>Preview</strong> to see how a sample recipient will read it, and <strong>Send test to me</strong> to receive the message on your own WhatsApp before launching.',
    },
    {
        icon: 'send',
        title: 'Send or Schedule',
        body: 'Hit <strong>Launch campaign</strong> to start immediately, or switch to the <strong>Schedule</strong> tab to set a future date/time. The bot paces itself with a 2s delay and pauses 30s every 50 sends to stay safe.',
    },
    {
        icon: 'activity',
        title: 'Monitor live',
        body: 'The <strong>Active</strong> tab shows every running or scheduled campaign with a live progress bar, sent/failed counts, and the option to stop an individual campaign.',
    },
    {
        icon: 'shield',
        title: 'Stay safe',
        body: 'Use the red <strong>EMERGENCY STOP ALL</strong> button if a campaign goes wrong — it pauses every active campaign before the next send. STOP replies from customers are honored automatically.',
    },
];

export function renderPromotionsGuide(container) {
    if (!container) return;
    container.innerHTML = `
        <ol class="promo-guide-list">
            ${STEPS.map((s, i) => `
                <li class="promo-guide-item">
                    <div class="promo-guide-num">${i + 1}</div>
                    <div>
                        <h4 class="promo-guide-title"><i data-lucide="${s.icon}" class="icon-16"></i> ${s.title}</h4>
                        <p class="text-muted-small mt-4">${s.body}</p>
                    </div>
                </li>
            `).join('')}
        </ol>
        <p class="text-muted-small mt-16">
            <i data-lucide="info" class="icon-14"></i>
            Only customers with <code>promotionalConsent: true</code> (recorded at their first order) will receive messages.
            Recipients are capped at 500 per campaign.
        </p>
    `;
    if (window.lucide) window.lucide.createIcons({ root: container });
}
