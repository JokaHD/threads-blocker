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
