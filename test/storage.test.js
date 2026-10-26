// Saves must never take the page down when the browser refuses storage.
//
// In a sandboxed frame without allow-same-origin (the way an itch.io-style
// host can embed a page), merely reading globalThis.localStorage throws. These
// functions used to take it as a default parameter, which is evaluated at the
// call, outside any try block, so the throw escaped to the caller.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveToStorage, loadFromStorage, clearStorage, newGame } from '../src/engine/state.js';

function withThrowingStorage(fn) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });
  try { return fn(); } finally {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete globalThis.localStorage;
  }
}

test('a storage getter that throws is reported, not raised', () => {
  withThrowingStorage(() => {
    const s = newGame({ seed: 1 });
    assert.deepEqual(saveToStorage(s), { ok: false, reason: 'no storage available' });
    assert.equal(loadFromStorage().ok, false);
    assert.doesNotThrow(() => clearStorage());
  });
});

test('a working storage round-trips', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const s = newGame({ seed: 2 });
  assert.equal(saveToStorage(s, storage).ok, true);
  const r = loadFromStorage(storage);
  assert.equal(r.ok, true);
  assert.equal(r.state.seed, s.seed);
});
