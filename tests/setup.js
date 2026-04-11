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

// Mock chrome.alarms
const alarmCallbacks = [];
export const mockAlarms = {
  create: jest.fn(),
  clear: jest.fn(() => Promise.resolve(true)),
  onAlarm: {
    addListener: jest.fn((cb) => alarmCallbacks.push(cb)),
  },
  _trigger: (alarm) => alarmCallbacks.forEach((cb) => cb(alarm)),
};

// Mock chrome.runtime
const messageListeners = [];
export const mockRuntime = {
  sendMessage: jest.fn((msg) => {
    return Promise.resolve();
  }),
  onMessage: {
    addListener: jest.fn((cb) => messageListeners.push(cb)),
  },
  _deliver: (msg, sender) => {
    const sendResponse = jest.fn();
    messageListeners.forEach((cb) => cb(msg, sender, sendResponse));
    return sendResponse;
  },
};

// Attach to global
export function setupChromeMocks() {
  global.chrome = {
    storage: { local: mockStorage },
    alarms: mockAlarms,
    runtime: mockRuntime,
  };
}

export function resetChromeMocks() {
  mockStorage._clear();
  jest.clearAllMocks();
}
