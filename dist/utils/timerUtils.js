"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatHms = formatHms;
exports.formatRelativeTime = formatRelativeTime;
exports.resolveBirthtimeMs = resolveBirthtimeMs;
exports.computeSessionElapsed = computeSessionElapsed;
exports.computeOpenedElapsed = computeOpenedElapsed;
exports.computeCreatedElapsed = computeCreatedElapsed;
function formatHms(ms) {
    if (ms < 0 || isNaN(ms)) {
        ms = 0;
    }
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
function formatRelativeTime(timestampMs, now = Date.now()) {
    if (!timestampMs || isNaN(timestampMs)) {
        return '--';
    }
    const diffMs = now - timestampMs;
    if (diffMs < 0) {
        return 'just now';
    }
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
        return 'just now';
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
        return `${diffMin}m ago`;
    }
    const diffHr = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    if (diffHr < 24) {
        return remMin > 0 ? `${diffHr}h ${remMin}m ago` : `${diffHr}h ago`;
    }
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
}
function resolveBirthtimeMs(stat) {
    if (stat.birthtimeMs && stat.birthtimeMs > 0) {
        return stat.birthtimeMs;
    }
    if (stat.ctimeMs && stat.ctimeMs > 0) {
        return stat.ctimeMs;
    }
    if (stat.mtimeMs && stat.mtimeMs > 0) {
        return stat.mtimeMs;
    }
    return Date.now();
}
function computeSessionElapsed(timer, now = Date.now()) {
    const accumulated = timer.accumulatedMs || 0;
    const running = Boolean(timer.isRunning);
    const startedAt = timer.lastStartedAt || now;
    const additional = running ? Math.max(0, now - startedAt) : 0;
    return Math.max(0, accumulated + additional);
}
function computeOpenedElapsed(timer, now = Date.now()) {
    const openedAt = timer.lastOpenedAt || timer.sessionOpenedAt || now;
    return Math.max(0, now - openedAt);
}
function computeCreatedElapsed(timer, now = Date.now()) {
    if (timer.birthtimeMs && timer.birthtimeMs > 0) {
        return Math.max(0, now - timer.birthtimeMs);
    }
    return computeSessionElapsed(timer, now);
}
//# sourceMappingURL=timerUtils.js.map