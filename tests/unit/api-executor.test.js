import { jest } from '@jest/globals';
import { setupChromeMocks, resetChromeMocks, mockRuntime } from '../setup.js';
import { MessageType } from '../../src/shared/messages.js';

setupChromeMocks();

let APIExecutor;
beforeAll(async () => {
  ({ APIExecutor } = await import('../../src/content/api-executor.js'));
});

let tokenProvider;
let apiFunctions;
let executor;

beforeEach(() => {
  resetChromeMocks();
  setupChromeMocks();

  tokenProvider = {
    getTokens: jest.fn().mockResolvedValue({ csrftoken: 'test', fb_dtsg: 'dtsg', lsd: 'lsd' }),
    refreshTokens: jest.fn().mockResolvedValue({ csrftoken: 'new', fb_dtsg: 'dtsg2', lsd: 'lsd2' }),
    invalidate: jest.fn(),
  };

  apiFunctions = {
    blockUser: jest.fn().mockResolvedValue({ success: true }),
    unblockUser: jest.fn().mockResolvedValue({ success: true }),
  };

  executor = new APIExecutor(tokenProvider, apiFunctions);
});

describe('processTask', () => {
  it('sends block request and reports success', async () => {
    const task = { userId: '123', username: 'alice', action: 'block' };

    await executor.processTask(task);

    expect(apiFunctions.blockUser).toHaveBeenCalledWith('123');
    expect(mockRuntime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.TASK_RESULT,
      userId: '123',
      success: true,
    });
  });

  it('reports failure when API returns error', async () => {
    apiFunctions.blockUser.mockResolvedValue({
      success: false,
      status: 500,
      error: 'Server error',
    });

    const task = { userId: '456', username: 'bob', action: 'block' };
    await executor.processTask(task);

    expect(mockRuntime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.TASK_RESULT,
      userId: '456',
      success: false,
      error: {
        status: 500,
        message: 'Server error',
        isNetworkError: false,
      },
    });
  });

  it('reports failure on exception', async () => {
    apiFunctions.blockUser.mockRejectedValue(new Error('Network failure'));

    const task = { userId: '456', username: 'bob', action: 'block' };
    await executor.processTask(task);

    expect(mockRuntime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.TASK_RESULT,
      userId: '456',
      success: false,
      error: {
        status: 0,
        message: 'Network failure',
        isNetworkError: true,
      },
    });
  });

  it('refreshes tokens on 401 and retries', async () => {
    apiFunctions.blockUser
      .mockResolvedValueOnce({ success: false, status: 401, error: 'Unauthorized' })
      .mockResolvedValueOnce({ success: true });

    const task = { userId: '789', username: 'carol', action: 'block' };
    await executor.processTask(task);

    expect(tokenProvider.invalidate).toHaveBeenCalled();
    expect(tokenProvider.refreshTokens).toHaveBeenCalled();
    expect(apiFunctions.blockUser).toHaveBeenCalledTimes(2);
    expect(mockRuntime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.TASK_RESULT,
      userId: '789',
      success: true,
    });
  });

  it('calls unblockUser when action is unblock', async () => {
    const task = { userId: '111', username: 'dave', action: 'unblock' };

    await executor.processTask(task);

    expect(apiFunctions.unblockUser).toHaveBeenCalledWith('111');
    expect(apiFunctions.blockUser).not.toHaveBeenCalled();
    expect(mockRuntime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.TASK_RESULT,
      userId: '111',
      success: true,
    });
  });
});
