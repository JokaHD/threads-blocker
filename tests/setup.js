// Mock chrome.storage.local
const storageData = {};
export const mockStorage = {
  get: jest.fn((keys) => {
    if (typeof keys === 'string') {
      return Promise.resolve({ [keys]: storageData[keys] });
    }
    const result = {};
    for (const key of keys) {
      if (storageData[key] !== undefined) result[key] = storageData[key];
    }
    return Promise.resolve(result);
  }),
  set: jest.fn((items) => {
    Object.assign(storageData, items);
    return Promise.resolve();
  }),
  remove: jest.fn((keys) => {
    const keyArr = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArr) delete storageData[key];
    return Promise.resolve();
  }),
  _clear: () => {
    for (const key in storageData) delete storageData[key];
  },
};

// Mock chrome.storage.onChanged
const storageChangeListeners = [];
export const mockStorageOnChanged = {
  addListener: jest.fn((cb) => storageChangeListeners.push(cb)),
  removeListener: jest.fn((cb) => {
    const i = storageChangeListeners.indexOf(cb);
    if (i !== -1) storageChangeListeners.splice(i, 1);
  }),
  _fire: (changes, area = 'local') => storageChangeListeners.forEach((cb) => cb(changes, area)),
};

// Mock chrome.commands
const commandListeners = [];
export const mockCommands = {
  getAll: jest.fn(() => Promise.resolve([])),
  onCommand: {
    addListener: jest.fn((cb) => commandListeners.push(cb)),
  },
  _trigger: (command) => Promise.all(commandListeners.map((cb) => cb(command))),
};

// Mock chrome.alarms
const alarmCallbacks = [];
export const mockAlarms = {
  create: jest.fn(),
  get: jest.fn(() => Promise.resolve(undefined)),
  clear: jest.fn(() => Promise.resolve(true)),
  onAlarm: {
    addListener: jest.fn((cb) => alarmCallbacks.push(cb)),
  },
  _trigger: (alarm) => alarmCallbacks.forEach((cb) => cb(alarm)),
};

// Mock chrome.runtime
const messageListeners = [];
export const mockRuntime = {
  sendMessage: jest.fn((_msg) => {
    return Promise.resolve();
  }),
  onMessage: {
    addListener: jest.fn((cb) => messageListeners.push(cb)),
  },
  openOptionsPage: jest.fn(() => Promise.resolve()),
  _deliver: (msg, sender) => {
    const sendResponse = jest.fn();
    messageListeners.forEach((cb) => cb(msg, sender, sendResponse));
    return sendResponse;
  },
};

// Attach to global
export function setupChromeMocks() {
  global.chrome = {
    storage: { local: mockStorage, onChanged: mockStorageOnChanged },
    alarms: mockAlarms,
    runtime: mockRuntime,
    commands: mockCommands,
  };
}

export function resetChromeMocks() {
  mockStorage._clear();
  jest.clearAllMocks();
}

// Mock fetch
export let mockFetchResponse = { ok: true, json: async () => ({}) };
export const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: mockFetchResponse.ok,
    status: mockFetchResponse.status || 200,
    json: mockFetchResponse.json || (async () => ({})),
    text: mockFetchResponse.text || (async () => ''),
  })
);

export function setMockFetchResponse(response) {
  mockFetchResponse = response;
}

export function setupFetchMock() {
  global.fetch = mockFetch;
}

export function resetFetchMock() {
  mockFetch.mockClear();
  mockFetchResponse = { ok: true, json: async () => ({}) };
}
