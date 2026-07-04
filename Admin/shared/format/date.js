const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return new Date(d.getTime() + IST_OFFSET_MS);
}

export function getISTDateString(dateInput = new Date()) {
    return toIST(dateInput).toISOString().split('T')[0];
}

export function formatDateShort(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'Asia/Kolkata'
    });
}

export function formatTimeShort(dateInput) {
    if (!dateInput) return '';
    return new Date(dateInput).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'Asia/Kolkata'
    });
}

export function formatDateIndian(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'Asia/Kolkata'
    });
}
