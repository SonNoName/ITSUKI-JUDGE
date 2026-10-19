export function formatHms(ms: number): string {
  if (ms < 0 || isNaN(ms)) {
    ms = 0;
  }
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatRelativeTime(timestampMs: number, now: number = Date.now()): string {
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

export function resolveBirthtimeMs(stat: { birthtimeMs?: number; ctimeMs?: number; mtimeMs?: number }): number {
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

export function computeSessionElapsed(
  timer: { accumulatedMs?: number; isRunning?: boolean; lastStartedAt?: number },
  now: number = Date.now()
): number {
  const accumulated = timer.accumulatedMs || 0;
  const running = Boolean(timer.isRunning);
  const startedAt = timer.lastStartedAt || now;
  const additional = running ? Math.max(0, now - startedAt) : 0;
  return Math.max(0, accumulated + additional);
}

export function computeOpenedElapsed(
  timer: { lastOpenedAt?: number; sessionOpenedAt?: number },
  now: number = Date.now()
): number {
  const openedAt = timer.lastOpenedAt || timer.sessionOpenedAt || now;
  return Math.max(0, now - openedAt);
}

export function computeCreatedElapsed(
  timer: { birthtimeMs?: number; accumulatedMs?: number; isRunning?: boolean; lastStartedAt?: number },
  now: number = Date.now()
): number {
  if (timer.birthtimeMs && timer.birthtimeMs > 0) {
    return Math.max(0, now - timer.birthtimeMs);
  }
  return computeSessionElapsed(timer, now);
}
