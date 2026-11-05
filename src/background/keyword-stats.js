/**
 * Keyword stats — the only writer of `keywordStats`.
 *
 * A post counts once per keyword (deduped by post key). When a user is
 * blocked through the queue, every hit post of theirs not yet attributed is
 * marked blocked. Unblocking never takes a count back: the stat means
 * "was blocked after showing this keyword".
 */

import { KeywordStorageKey, KeywordLimits } from '../shared/keywords.js';

const KEY = KeywordStorageKey.STATS;

export class KeywordStats {
  /**
   * @param {{now?: () => number}} [options]
   */
  constructor({ now = () => Date.now() } = {}) {
    this._now = now;
    this._chain = Promise.resolve();
  }

  /**
   * @param {Array<{postKey: string, username: string, keywordIds: string[]}>} hits
   */
  recordHits(hits) {
    return this._update((stats) => {
      let changed = false;
      for (const { postKey, username, keywordIds } of hits) {
        if (!postKey || !username || !keywordIds?.length) continue;
        stats.posts[postKey] ??= { username, keywordIds: [], ts: this._now(), blocked: false };
        const post = stats.posts[postKey];
        for (const id of keywordIds) {
          if (post.keywordIds.includes(id)) continue;
          post.keywordIds.push(id);
          const counts = countsFor(stats, id);
          counts.hits += 1;
          if (post.blocked) counts.blocked += 1;
          changed = true;
        }
      }
      if (changed) prunePosts(stats);
      return changed;
    });
  }

  /** A block of `username` succeeded */
  onBlocked(username) {
    return this._update((stats) => {
      let changed = false;
      for (const post of Object.values(stats.posts)) {
        if (post.username !== username || post.blocked) continue;
        post.blocked = true;
        for (const id of post.keywordIds) countsFor(stats, id).blocked += 1;
        changed = true;
      }
      return changed;
    });
  }

  /** Keywords deleted on the options page take their stats with them */
  removeKeywords(ids) {
    const gone = new Set(ids);
    return this._update((stats) => {
      let changed = false;
      for (const id of gone) {
        if (!stats.perKeyword[id]) continue;
        delete stats.perKeyword[id];
        changed = true;
      }
      for (const [key, post] of Object.entries(stats.posts)) {
        const kept = post.keywordIds.filter((id) => !gone.has(id));
        if (kept.length === post.keywordIds.length) continue;
        changed = true;
        if (kept.length > 0) post.keywordIds = kept;
        else delete stats.posts[key];
      }
      return changed;
    });
  }

  /**
   * Read-modify-write, serialized so overlapping messages in this service
   * worker can't drop each other's update. Never rejects: a failed write is
   * logged and the next update starts from storage again.
   *
   * @param {(stats: object) => boolean} mutate - returns whether to save
   */
  _update(mutate) {
    this._chain = this._chain
      .then(async () => {
        const result = await chrome.storage.local.get(KEY);
        const stats = result[KEY] ?? { since: this._now(), perKeyword: {}, posts: {} };
        if (mutate(stats)) await chrome.storage.local.set({ [KEY]: stats });
      })
      .catch((err) => console.error('[ThreadBlocker] Keyword stats update failed:', err));
    return this._chain;
  }
}

function countsFor(stats, id) {
  stats.perKeyword[id] ??= { hits: 0, blocked: 0 };
  return stats.perKeyword[id];
}

function prunePosts(stats) {
  const keys = Object.keys(stats.posts);
  const excess = keys.length - KeywordLimits.MAX_POSTS;
  if (excess <= 0) return;
  keys.sort((a, b) => stats.posts[a].ts - stats.posts[b].ts);
  for (const key of keys.slice(0, excess)) delete stats.posts[key];
}
