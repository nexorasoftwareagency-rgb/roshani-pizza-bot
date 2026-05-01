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
