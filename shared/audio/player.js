/**
 * SHARED AUDIO PLAYER — single owner of alert.mp3 path.
 *
 * Usage:
 *   import { playBeep, startContinuousBeep, stopContinuousBeep } from '../shared/audio/player.js';
 *
 * The audio file must exist at the path relative to the consuming app's root:
 *   Admin: Admin/assets/sounds/alert.mp3
 *   Rider: rider/assets/sounds/alert.mp3
 * For a unified approach, both apps should reference the same canonical file.
 */

const BEEP_PATH = 'assets/sounds/alert.mp3';

let _continuousAudio = null;
let _continuousInterval = null;

/**
 * Play a single notification beep.
 */
export function playBeep() {
    try {
        const audio = new Audio(BEEP_PATH);
        audio.play().catch(e => console.warn('[Audio] Beep playback failed:', e));
    } catch (e) {
        console.warn('[Audio] Beep init failed:', e);
    }
}

/**
 * Play a success sound (alias for beep — same file).
 */
export function playSuccessBeep() {
    playBeep();
}

/**
 * Start playing beeps at a given interval.
 * Returns a stop function.
 */
export function startContinuousBeep(intervalMs = 10000) {
    stopContinuousBeep();
    _continuousAudio = new Audio(BEEP_PATH);
    _continuousAudio.play().catch(e => console.warn('[Audio] Continuous beep failed:', e));
    _continuousInterval = setInterval(() => {
        _continuousAudio.currentTime = 0;
        _continuousAudio.play().catch(() => {});
    }, intervalMs);
    return stopContinuousBeep;
}

/**
 * Stop the continuous beep loop.
 */
export function stopContinuousBeep() {
    if (_continuousInterval) {
        clearInterval(_continuousInterval);
        _continuousInterval = null;
    }
    if (_continuousAudio) {
        _continuousAudio.pause();
        _continuousAudio = null;
    }
}
