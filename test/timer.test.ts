import * as assert from 'assert';
import { describe, it } from 'node:test';
import { formatHms, formatRelativeTime, resolveBirthtimeMs } from '../src/utils/timerUtils';

describe('Timer Utility and Elapsed Calculation Tests', () => {
  it('formatHms formats zero and negative milliseconds safely', () => {
    assert.strictEqual(formatHms(0), '00:00:00');
    assert.strictEqual(formatHms(-500), '00:00:00');
    assert.strictEqual(formatHms(NaN), '00:00:00');
  });

  it('formatHms correctly pads and formats seconds, minutes, and hours', () => {
    assert.strictEqual(formatHms(5000), '00:00:05');
    assert.strictEqual(formatHms(59000), '00:00:59');
    assert.strictEqual(formatHms(65000), '00:01:05');
    assert.strictEqual(formatHms(600000), '00:10:00');
    assert.strictEqual(formatHms(3661000), '01:01:01');
    assert.strictEqual(formatHms(86400000), '24:00:00');
  });

  it('formatRelativeTime returns just now for very recent timestamps or future drift', () => {
    const now = 1000000000000;
    assert.strictEqual(formatRelativeTime(now - 10000, now), 'just now');
    assert.strictEqual(formatRelativeTime(now - 59000, now), 'just now');
    // Future timestamp (clock skew)
    assert.strictEqual(formatRelativeTime(now + 5000, now), 'just now');
    // Invalid timestamp
    assert.strictEqual(formatRelativeTime(0, now), '--');
    assert.strictEqual(formatRelativeTime(NaN, now), '--');
  });

  it('formatRelativeTime formats minutes, hours and days', () => {
    const now = 1000000000000;
    // 5 minutes ago
    assert.strictEqual(formatRelativeTime(now - 5 * 60 * 1000, now), '5m ago');
    // 1 hour 15 minutes ago
    assert.strictEqual(formatRelativeTime(now - (1 * 3600 + 15 * 60) * 1000, now), '1h 15m ago');
    // 2 hours exactly ago
    assert.strictEqual(formatRelativeTime(now - 2 * 3600 * 1000, now), '2h ago');
    // 3 days ago
    assert.strictEqual(formatRelativeTime(now - 3 * 86400 * 1000, now), '3d ago');
  });

  it('resolveBirthtimeMs resolves birthtime, ctime, or mtime fallback', () => {
    // 1. When birthtime is valid
    assert.strictEqual(resolveBirthtimeMs({ birthtimeMs: 1234567, ctimeMs: 2000000, mtimeMs: 3000000 }), 1234567);

    // 2. When birthtime is 0 or negative (common on Linux file systems without crtime)
    assert.strictEqual(resolveBirthtimeMs({ birthtimeMs: 0, ctimeMs: 2000000, mtimeMs: 3000000 }), 2000000);
    assert.strictEqual(resolveBirthtimeMs({ birthtimeMs: -1, ctimeMs: 0, mtimeMs: 3000000 }), 3000000);

    // 3. When only mtime is available
    assert.strictEqual(resolveBirthtimeMs({ birthtimeMs: 0, ctimeMs: 0, mtimeMs: 999999 }), 999999);

    // 4. When all are undefined or 0
    const resolved = resolveBirthtimeMs({});
    assert.ok(typeof resolved === 'number' && resolved > 0);
  });

  it('Active solve session elapsed time calculation logic handles pause, resume, and switch correctly', () => {
    let session = {
      birthtimeMs: 1000000,
      sessionOpenedAt: 1000000,
      accumulatedMs: 0,
      isRunning: true,
      lastStartedAt: 1000000,
    };

    // After 10 seconds of active work
    let currentNow = 1010000;
    let elapsed = session.accumulatedMs + (session.isRunning ? currentNow - session.lastStartedAt : 0);
    assert.strictEqual(elapsed, 10000);

    // User pauses timer at 10s
    session.accumulatedMs += Math.max(0, currentNow - session.lastStartedAt);
    session.isRunning = false;
    assert.strictEqual(session.accumulatedMs, 10000);

    // While paused for 20 seconds, elapsed remains 10000
    currentNow = 1030000;
    elapsed = session.accumulatedMs + (session.isRunning ? currentNow - session.lastStartedAt : 0);
    assert.strictEqual(elapsed, 10000);

    // User resumes timer at currentNow = 1030000
    session.lastStartedAt = currentNow;
    session.isRunning = true;

    // After 5 more seconds
    currentNow = 1035000;
    elapsed = session.accumulatedMs + (session.isRunning ? currentNow - session.lastStartedAt : 0);
    assert.strictEqual(elapsed, 15000);

    // User resets timer
    session.accumulatedMs = 0;
    session.lastStartedAt = currentNow;
    session.sessionOpenedAt = currentNow;
    elapsed = session.accumulatedMs + (session.isRunning ? currentNow - session.lastStartedAt : 0);
    assert.strictEqual(elapsed, 0);
  });

  it('Helper functions computeSessionElapsed, computeOpenedElapsed, and computeCreatedElapsed calculate accurately', () => {
    const { computeSessionElapsed, computeOpenedElapsed, computeCreatedElapsed } = require('../src/utils/timerUtils');
    const baseTimer = {
      birthtimeMs: 1000000,
      firstOpenedAt: 1050000,
      lastOpenedAt: 1080000,
      sessionOpenedAt: 1050000,
      accumulatedMs: 25000,
      isRunning: true,
      lastStartedAt: 1090000,
    };

    const now = 1100000; // 10s after lastStartedAt

    // Session: 25s accumulated + 10s running = 35s
    assert.strictEqual(computeSessionElapsed(baseTimer, now), 35000);

    // Opened: now (1100000) - lastOpenedAt (1080000) = 20s
    assert.strictEqual(computeOpenedElapsed(baseTimer, now), 20000);

    // Created: now (1100000) - birthtimeMs (1000000) = 100s
    assert.strictEqual(computeCreatedElapsed(baseTimer, now), 100000);

    // When timer is paused
    const pausedTimer = { ...baseTimer, isRunning: false };
    assert.strictEqual(computeSessionElapsed(pausedTimer, now), 25000);
  });

  it('Multi-file tab switching isolates solve session timers without leaking background time', () => {
    const { computeSessionElapsed } = require('../src/utils/timerUtils');

    // Simulate User starting fileA at t = 1000
    let timerA = {
      birthtimeMs: 500,
      firstOpenedAt: 1000,
      lastOpenedAt: 1000,
      sessionOpenedAt: 1000,
      accumulatedMs: 0,
      isRunning: true,
      isPausedByUser: false,
      lastStartedAt: 1000,
    };

    // User works on fileA for 60 seconds (t = 1060)
    let t = 1060;
    assert.strictEqual(computeSessionElapsed(timerA, t), 60);

    // User switches to fileB at t = 1060: fileA is paused
    timerA.accumulatedMs += Math.max(0, t - timerA.lastStartedAt);
    timerA.isRunning = false;

    let timerB = {
      birthtimeMs: 800,
      firstOpenedAt: t,
      lastOpenedAt: t,
      sessionOpenedAt: t,
      accumulatedMs: 0,
      isRunning: true,
      isPausedByUser: false,
      lastStartedAt: t,
    };

    // User works on fileB for 300 seconds (t = 1360)
    t = 1360;
    assert.strictEqual(computeSessionElapsed(timerB, t), 300);

    // fileA was inactive during these 300 seconds; its elapsed time MUST remain 60 seconds!
    assert.strictEqual(computeSessionElapsed(timerA, t), 60);

    // User switches back to fileA at t = 1360:
    // fileB is paused
    timerB.accumulatedMs += Math.max(0, t - timerB.lastStartedAt);
    timerB.isRunning = false;

    // fileA resumes because it was not manually paused by user
    timerA.lastOpenedAt = t;
    if (!timerA.isPausedByUser) {
      timerA.isRunning = true;
      timerA.lastStartedAt = t;
    }

    // User works 40 more seconds on fileA (t = 1400)
    t = 1400;
    assert.strictEqual(computeSessionElapsed(timerA, t), 100); // 60 + 40 = 100
    assert.strictEqual(computeSessionElapsed(timerB, t), 300); // fileB remains 300
  });
});
