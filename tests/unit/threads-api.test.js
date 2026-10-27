import { jest } from '@jest/globals';

// Mock fetch before importing module
let mockFetchResponse;
global.fetch = jest.fn(() => Promise.resolve(mockFetchResponse));

const { blockUser, unblockUser } = await import('../../src/content/threads-api.js');

function setFetchResponse(response) {
  mockFetchResponse = {
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.json ?? {},
    text: async () => response.text ?? '',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setFetchResponse({ ok: true, json: { data: {} } });
});

describe('blockUser', () => {
  const tokens = { csrftoken: 'csrf123', fb_dtsg: 'dtsg456', lsd: 'lsd789' };

  it('returns success on valid response', async () => {
    setFetchResponse({ ok: true, json: { data: { success: true } } });

    const result = await blockUser('12345', tokens);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends correct GraphQL request format', async () => {
    setFetchResponse({ ok: true, json: { data: {} } });

    await blockUser('12345', tokens);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://www.threads.com/api/graphql');
    expect(options.method).toBe('POST');
    expect(options.headers['x-csrftoken']).toBe('csrf123');
    expect(options.headers['x-ig-app-id']).toBe('238260118697367');

    const body = new URLSearchParams(options.body);
    expect(body.get('doc_id')).toBe('26803837702651619');
    expect(JSON.parse(body.get('variables'))).toMatchObject({ user_id: '12345' });
  });

  it('returns failure on HTTP error', async () => {
    setFetchResponse({ ok: false, status: 500 });

    const result = await blockUser('12345', tokens);

    expect(result.success).toBe(false);
    expect(result.error).toBe('HTTP 500');
    expect(result.status).toBe(500);
  });

  it('returns failure on GraphQL error', async () => {
    setFetchResponse({
      ok: true,
      json: { errors: [{ message: 'Rate limited' }] },
    });

    const result = await blockUser('12345', tokens);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limited');
  });

  it('returns failure on network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await blockUser('12345', tokens);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });
});

describe('unblockUser', () => {
  const tokens = { csrftoken: 'csrf123', fb_dtsg: 'dtsg456', lsd: 'lsd789' };

  it('sends correct doc_id for unblock', async () => {
    setFetchResponse({ ok: true, json: { data: {} } });

    await unblockUser('12345', tokens);

    const [, options] = global.fetch.mock.calls[0];
    const body = new URLSearchParams(options.body);
    expect(body.get('doc_id')).toBe('26247169961577940');
  });

  it('returns success on valid response', async () => {
    setFetchResponse({ ok: true, json: { data: {} } });

    const result = await unblockUser('12345', tokens);

    expect(result.success).toBe(true);
  });
});

describe('dev failure log (__TB_DEV_LOG__)', () => {
  const tokens = { csrftoken: 'csrf123', fb_dtsg: 'dtsg456', lsd: 'lsd789' };
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete globalThis.__TB_DEV_LOG__;
  });

  it('stays silent when the flag is not defined (release build)', async () => {
    setFetchResponse({ ok: false, status: 400, text: 'nope' });
    await blockUser('12345', tokens);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  describe('when enabled', () => {
    beforeEach(() => {
      globalThis.__TB_DEV_LOG__ = true;
    });

    it('logs status and raw body on HTTP error', async () => {
      setFetchResponse({ ok: false, status: 400, text: '{"message":"feedback_required"}' });
      await blockUser('12345', tokens);
      expect(warnSpy).toHaveBeenCalledWith(
        '[TB-dev] request failed',
        'useTHUserBlockMutation',
        'userId=',
        '12345',
        { httpStatus: 400, body: '{"message":"feedback_required"}' }
      );
    });

    it('logs the full response body on GraphQL error', async () => {
      const json = { errors: [{ message: 'Please wait a few minutes' }] };
      setFetchResponse({ ok: true, json });
      await blockUser('12345', tokens);
      expect(warnSpy).toHaveBeenCalledWith(
        '[TB-dev] request failed',
        'useTHUserBlockMutation',
        'userId=',
        '12345',
        { httpStatus: 200, body: json }
      );
    });

    it('logs the error on network failure', async () => {
      global.fetch.mockImplementationOnce(() => Promise.reject(new Error('offline')));
      await blockUser('12345', tokens);
      expect(warnSpy).toHaveBeenCalledWith(
        '[TB-dev] request failed',
        'useTHUserBlockMutation',
        'userId=',
        '12345',
        { networkError: 'offline' }
      );
    });

    it('does not log on success', async () => {
      await blockUser('12345', tokens);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
