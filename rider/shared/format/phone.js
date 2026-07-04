export function cleanPhone(phone) {
    return String(phone || '').replace(/\D/g, '').slice(-10);
}

export function isValidIndianPhone(phone) {
    const c = cleanPhone(phone);
    return c.length === 10 && /^[6-9]\d{9}$/.test(c);
}

export function toWaMe(phone) {
    const c = cleanPhone(phone);
    return c ? `https://wa.me/91${c}` : '';
}
