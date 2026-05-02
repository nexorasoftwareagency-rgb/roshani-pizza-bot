export const showToast = (message, type = 'success') => {
    const container = document.getElementById('alertContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

export const showConfirm = (message, title = "Confirm Action") => {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'confirmOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
        `;

        overlay.innerHTML = `
            <div class="confirm-box" style="background: #1c1c1c; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
                        padding: 32px; max-width: 360px; width: 90%; text-align: center;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                <h3 class="confirm-title" style="color: #fff; margin: 0 0 12px; font-size: 18px; font-weight: 700;"></h3>
                <p class="confirm-message" style="color: #aaa; font-size: 14px; margin: 0 0 24px;"></p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button class="confirm-no" style="flex: 1; padding: 12px; border-radius: 12px; border: 1px solid #333; background: transparent; color: #aaa; cursor: pointer; font-size: 14px; font-weight: 600;">Cancel</button>
                    <button class="confirm-yes" style="flex: 1; padding: 12px; border-radius: 12px; border: none; background: var(--action-green); color: #fff; cursor: pointer; font-size: 14px; font-weight: 700;">Confirm</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        overlay.querySelector('.confirm-title').innerText = title;
        overlay.querySelector('.confirm-message').innerText = message;

        const cleanup = (val) => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
                resolve(val);
            }, 200);
        };

        overlay.querySelector('.confirm-yes').onclick = () => cleanup(true);
        overlay.querySelector('.confirm-no').onclick = () => cleanup(false);
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
};

export const showPaymentPicker = (total) => {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
        `;

        overlay.innerHTML = `
            <div style="background: #1c1c1c; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
                        padding: 32px; max-width: 400px; width: 95%; text-align: center;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                <h3 style="color: #fff; margin: 0 0 12px; font-size: 20px; font-weight: 700;">Record Payment</h3>
                <p style="color: #aaa; font-size: 14px; margin: 0 0 24px;">Confirm payment method for <b>₹${total}</b></p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <button data-method="Cash" style="padding: 15px; border-radius: 12px; border: 1px solid #333; background: #262626; color: #fff; cursor: pointer; font-weight: 600;">💵 Cash</button>
                    <button data-method="UPI" style="padding: 15px; border-radius: 12px; border: 1px solid #333; background: #262626; color: #fff; cursor: pointer; font-weight: 600;">📱 UPI</button>
                    <button data-method="Card" style="padding: 15px; border-radius: 12px; border: 1px solid #333; background: #262626; color: #fff; cursor: pointer; font-weight: 600;">💳 Card</button>
                    <button id="cancelPay" style="padding: 15px; border-radius: 12px; border: 1px solid #c53030; background: transparent; color: #c53030; cursor: pointer; font-weight: 600;">Cancel</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const cleanup = (val) => {
            overlay.remove();
            resolve(val);
        };

        overlay.querySelectorAll('button[data-method]').forEach(btn => {
            btn.onclick = () => cleanup(btn.getAttribute('data-method'));
        });
        overlay.querySelector('#cancelPay').onclick = () => cleanup(null);
    });
};
