export const MessageType = {
  // Content Script → Service Worker
  REGISTER_EXECUTOR: 'registerExecutor',
  GET_NEXT_TASK: 'getNextTask',
  TASK_RESULT: 'taskResult',
  ENQUEUE_BLOCK: 'enqueueBlock',
  ENQUEUE_BLOCK_BATCH: 'enqueueBlockBatch',
  CANCEL_QUEUED: 'cancelQueued',
  REQUEST_UNBLOCK: 'requestUnblock',
  RETRY_FAILED: 'retryFailed',
  PAUSE_QUEUE: 'pauseQueue',
  RESUME_QUEUE: 'resumeQueue',
  GET_ALL_STATES: 'getAllStates',
  GET_QUEUE_STATUS: 'getQueueStatus',
  CLEAR_QUEUE: 'clearQueue',
  CLEAR_COMPLETED: 'clearCompleted',

  // Service Worker → Content Script (via storage change)
  QUEUE_UPDATED: 'queueUpdated',
  STATE_CHANGED: 'stateChanged',
};
