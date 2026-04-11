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
    getToken: jest.fn().mockResolvedValue('test-token'),
    refreshToken: jest.fn().mockResolvedValue('new-token'),
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

    expect(tokenProvider.getToken).toHaveBeenCalled();
    expect(apiFunctions.blockUser).toHaveBeenCalledWith('123', 'test-token');
    expect(mockRuntime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.TASK_RESULT,
      userId: '123',
      success: true,
    });
  });

  it('reports failure on fetch error', async () => {
    const error = new Error('Network failure');
    error.status = 0;
    apiFunctions.blockUser.mockRejectedValue(error);

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

  it('refreshes token on 401 and retries', async () => {
    const authError = new Error('Unauthorized');
    authError.status = 401;
    apiFunctions.blockUser
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce({ success: true });

    const task = { userId: '789', username: 'carol', action: 'block' };
    await executor.processTask(task);

    expect(tokenProvider.invalidate).toHaveBeenCalled();
    expect(tokenProvider.refreshToken).toHaveBeenCalled();
    expect(apiFunctions.blockUser).toHaveBeenCalledTimes(2);
    expect(apiFunctions.blockUser).toHaveBeenLastCalledWith('789', 'new-token');
    expect(mockRuntime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.TASK_RESULT,
      userId: '789',
      success: true,
    });
  });

  it('calls unblockUser when action is unblock', async () => {
    const task = { userId: '111', username: 'dave', action: 'unblock' };

    await executor.processTask(task);

    expect(apiFunctions.unblockUser).toHaveBeenCalledWith('111', 'test-token');
    expect(apiFunctions.blockUser).not.toHaveBeenCalled();
    expect(mockRuntime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.TASK_RESULT,
      userId: '111',
      success: true,
    });
  });
});
