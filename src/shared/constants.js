// Queue item states (managed by Service Worker)
export const BlockState = {
  IDLE: 'idle',
  RESOLVING: 'resolving', // userId not yet resolved
  QUEUED: 'queued',
  BLOCKING: 'blocking',
  BLOCKED: 'blocked',
  UNBLOCKING: 'unblocking',
  FAILED: 'failed',
};

// UI-only states (managed by Content Script)
export const UIState = {
  CONFIRM_UNBLOCK: 'confirm_unblock',
};

// Transient flags on queue items
export const QueueFlag = {
  PENDING_CANCEL: 'pending_cancel',
};

// Error categories
export const ErrorType = {
  RATE_LIMIT: 'rate_limit',
  TRANSIENT: 'transient',
  AUTH_EXPIRED: 'auth_expired',
  PERMANENT: 'permanent',
};

// Timing constants (ms)
export const Timing = {
  BLOCK_INTERVAL: 1500,
  RETRY_1_DELAY: 3000,
  RETRY_2_DELAY: 5000,
  COOLDOWN_MINUTES: 30,
  CONFIRM_UNBLOCK_TIMEOUT: 3000,
  ANCHOR_TIMEOUT: 5 * 60 * 1000,
  ANIMATION_DURATION: 200,
};

// Selection limits
export const Limits = {
  MAX_SCROLL_RECORD: 500,
};

// Threads API configuration
export const ThreadsAPI = {
  ENDPOINT: 'https://www.threads.com/api/graphql',
  IG_APP_ID: '238260118697367',
  DOC_IDS: {
    block: '26803837702651619',
    unblock: '26247169961577940',
  },
};

// Design tokens
export const Colors = {
  PRIMARY: '#2563EB',
  DANGER: '#DC2626',
  SUCCESS: '#16A34A',
  WARNING: '#F59E0B',
  SURFACE: '#F8FAFC',
  TEXT: '#1E293B',
  BORDER: '#E2E8F0',
  SELECTION_BG: '#EFF6FF',
  TOOLBAR_BG: '#1E293B',
};
