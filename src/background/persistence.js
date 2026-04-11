const QUEUE_KEY = 'blockQueue';
const COOLDOWN_KEY = 'cooldownEnd';

export async function saveQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

export async function loadQueue() {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  return result[QUEUE_KEY] || [];
}

export async function saveCooldownEnd(timestamp) {
  await chrome.storage.local.set({ [COOLDOWN_KEY]: timestamp });
}

export async function loadCooldownEnd() {
  const result = await chrome.storage.local.get(COOLDOWN_KEY);
  return result[COOLDOWN_KEY] || null;
}

export async function clearCooldown() {
  await chrome.storage.local.remove(COOLDOWN_KEY);
}
