import { setupChromeMocks, resetChromeMocks } from '../setup.js';
import { KeywordStats } from '../../src/background/keyword-stats.js';
import { KeywordLimits } from '../../src/shared/keywords.js';

setupChromeMocks();

const read = async () => (await chrome.storage.local.get('keywordStats')).keywordStats;
const hit = (postKey, username, ...keywordIds) => ({ postKey, username, keywordIds });

describe('KeywordStats', () => {
  let stats;
  let now;

  beforeEach(() => {
    resetChromeMocks();
    now = 1000;
    stats = new KeywordStats({ now: () => now });
  });

  test('counts a post once per keyword', async () => {
    await stats.recordHits([hit('/@a/post/1', 'a', 'k1', 'k2')]);
    await stats.recordHits([hit('/@a/post/1', 'a', 'k1')]);

    const s = await read();
    expect(s.since).toBe(1000);
    expect(s.perKeyword).toEqual({ k1: { hits: 1, blocked: 0 }, k2: { hits: 1, blocked: 0 } });
    expect(s.posts['/@a/post/1']).toEqual({
      username: 'a',
      keywordIds: ['k1', 'k2'],
      ts: 1000,
      blocked: false,
    });
  });

  test('adds a keyword that matches an already-seen post later', async () => {
    await stats.recordHits([hit('p1', 'a', 'k1')]);
    await stats.recordHits([hit('p1', 'a', 'k2')]);

    const s = await read();
    expect(s.perKeyword.k2).toEqual({ hits: 1, blocked: 0 });
    expect(s.posts.p1.keywordIds).toEqual(['k1', 'k2']);
  });

  test('attributes a block to every unattributed hit post of that user, once', async () => {
    await stats.recordHits([hit('p1', 'a', 'k1'), hit('p2', 'a', 'k1'), hit('p3', 'b', 'k1')]);

    await stats.onBlocked('a');
    await stats.onBlocked('a');

    const s = await read();
    expect(s.perKeyword.k1).toEqual({ hits: 3, blocked: 2 });
    expect(s.posts.p1.blocked).toBe(true);
    expect(s.posts.p3.blocked).toBe(false);
  });

  test('a keyword newly matching an attributed post counts as blocked too', async () => {
    await stats.recordHits([hit('p1', 'a', 'k1')]);
    await stats.onBlocked('a');
    await stats.recordHits([hit('p1', 'a', 'k2')]);

    expect((await read()).perKeyword.k2).toEqual({ hits: 1, blocked: 1 });
  });

  test('a block of a user without hit posts writes nothing', async () => {
    await stats.onBlocked('nobody');
    expect(await read()).toBeUndefined();
  });

  test('skips malformed hits', async () => {
    await stats.recordHits([hit('', 'a', 'k1'), hit('p1', '', 'k1'), hit('p2', 'a')]);
    expect(await read()).toBeUndefined();
  });

  test('drops the oldest posts beyond the cap but keeps totals', async () => {
    const total = KeywordLimits.MAX_POSTS + 2;
    const hits = Array.from({ length: total }, (_, i) => hit(`p${i}`, 'a', 'k1'));

    now = 1;
    await stats.recordHits(hits.slice(0, 2));
    now = 2;
    await stats.recordHits(hits.slice(2));

    const s = await read();
    expect(Object.keys(s.posts)).toHaveLength(KeywordLimits.MAX_POSTS);
    expect(s.posts.p0).toBeUndefined();
    expect(s.posts.p1).toBeUndefined();
    expect(s.perKeyword.k1.hits).toBe(total);
  });

  test('removeKeywords clears totals and detaches posts', async () => {
    await stats.recordHits([hit('p1', 'a', 'k1', 'k2'), hit('p2', 'a', 'k1')]);

    await stats.removeKeywords(['k1']);

    const s = await read();
    expect(s.perKeyword).toEqual({ k2: { hits: 1, blocked: 0 } });
    expect(s.posts.p1.keywordIds).toEqual(['k2']);
    expect(s.posts.p2).toBeUndefined();
  });

  test('serializes concurrent updates', async () => {
    await Promise.all([
      stats.recordHits([hit('p1', 'a', 'k1')]),
      stats.recordHits([hit('p2', 'b', 'k1')]),
    ]);
    expect((await read()).perKeyword.k1.hits).toBe(2);
  });

  test('a failed write is logged and does not break later updates', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    chrome.storage.local.set.mockRejectedValueOnce(new Error('quota'));

    await expect(stats.recordHits([hit('p1', 'a', 'k1')])).resolves.toBeUndefined();
    await stats.recordHits([hit('p2', 'a', 'k1')]);

    expect(error).toHaveBeenCalled();
    expect((await read()).posts.p2).toBeDefined();
    error.mockRestore();
  });
});
