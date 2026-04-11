import { jest } from '@jest/globals';
import { setupChromeMocks, resetChromeMocks } from '../setup.js';

// Set up chrome mocks before importing the module under test
setupChromeMocks();

import {
  saveQueue,
  loadQueue,
  saveCooldownEnd,
  loadCooldownEnd,
  clearCooldown,
} from '../../src/background/persistence.js';

beforeEach(() => {
  resetChromeMocks();
  setupChromeMocks();
});

describe('saveQueue', () => {
  it('stores the queue array in chrome.storage.local', async () => {
    const queue = [{ userId: '1', username: 'alice' }];
    await saveQueue(queue);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ blockQueue: queue });
  });
});

describe('loadQueue', () => {
  it('returns an empty array when nothing is stored', async () => {
    const result = await loadQueue();
    expect(result).toEqual([]);
  });

  it('returns the stored queue when data exists', async () => {
    const queue = [{ userId: '2', username: 'bob' }];
    await saveQueue(queue);
    const result = await loadQueue();
    expect(result).toEqual(queue);
  });
});

describe('saveCooldownEnd', () => {
  it('stores the cooldown timestamp in chrome.storage.local', async () => {
    const timestamp = Date.now() + 60000;
    await saveCooldownEnd(timestamp);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ cooldownEnd: timestamp });
  });
});

describe('loadCooldownEnd', () => {
  it('returns null when no cooldown is stored', async () => {
    const result = await loadCooldownEnd();
    expect(result).toBeNull();
  });

  it('returns the stored timestamp when cooldown exists', async () => {
    const timestamp = Date.now() + 30000;
    await saveCooldownEnd(timestamp);
    const result = await loadCooldownEnd();
    expect(result).toBe(timestamp);
  });
});

describe('clearCooldown', () => {
  it('removes the cooldown key from chrome.storage.local', async () => {
    const timestamp = Date.now() + 30000;
    await saveCooldownEnd(timestamp);
    await clearCooldown();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('cooldownEnd');
    // Verify the value is gone
    const result = await loadCooldownEnd();
    expect(result).toBeNull();
  });
});
