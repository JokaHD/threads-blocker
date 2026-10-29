/** @jest-environment jsdom */

import { DOMObserver, COMMENT_ID_ATTR } from '../../src/content/dom-observer.js';
import { threadsSiteRule } from '../../src/content/site-adapter.js';

describe('DOMObserver', () => {
  let observer;

  beforeEach(() => {
    observer = new DOMObserver();
    observer.init();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    observer.stopObserving();
  });

  // ── Site Adapter extractUsername ─────────────────────────────────────────────

  describe('threadsSiteRule.extractUsername', () => {
    it('parses a simple /@username href', () => {
      expect(threadsSiteRule.extractUsername('/@johndoe')).toBe('johndoe');
    });

    it('parses usernames with underscores and dots', () => {
      expect(threadsSiteRule.extractUsername('/@john.doe_123')).toBe('john.doe_123');
    });

    it('returns null for /explore', () => {
      expect(threadsSiteRule.extractUsername('/explore')).toBeNull();
    });

    it('returns null for an external URL', () => {
      expect(threadsSiteRule.extractUsername('https://example.com/@user')).toBeNull();
    });

    it('returns null for bare @username (missing leading slash)', () => {
      expect(threadsSiteRule.extractUsername('@johndoe')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(threadsSiteRule.extractUsername('')).toBeNull();
    });

    it('returns null for /@username/post/123 (extra path segments)', () => {
      expect(threadsSiteRule.extractUsername('/@johndoe/post/123')).toBeNull();
    });
  });

  // ── findComments ──────────────────────────────────────────────────────────

  describe('findComments', () => {
    it('detects a comment element containing a /@username link', () => {
      document.body.innerHTML = `
        <div class="comment">
          <a href="/@alice">Alice</a>
          <p>Some comment text</p>
          <span>extra</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(1);
      expect(comments[0].username).toBe('alice');
    });

    it('detects multiple comments', () => {
      document.body.innerHTML = `
        <div class="feed">
          <div class="comment"><a href="/@alice">Alice</a><p>text</p><span>x</span></div>
          <div class="comment"><a href="/@bob">Bob</a><p>text</p><span>x</span></div>
        </div>
      `;
      const comments = observer.findComments(document.body);
      const usernames = comments.map((c) => c.username).sort();
      expect(usernames).toEqual(['alice', 'bob']);
    });

    it('ignores /explore links', () => {
      document.body.innerHTML = `
        <div class="nav">
          <a href="/explore">Explore</a>
          <span>other</span>
          <span>x</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(0);
    });

    it('ignores links that do not match the /@username pattern', () => {
      document.body.innerHTML = `
        <div>
          <a href="/settings">Settings</a>
          <span>x</span>
          <span>y</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(0);
    });

    it('ignores already-processed elements', () => {
      document.body.innerHTML = `
        <div class="comment" ${COMMENT_ID_ATTR}="alice">
          <a href="/@alice">Alice</a>
          <p>Some comment text</p>
          <span>extra</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(0);
    });

    it('marks every comment of a user who commented more than once', () => {
      document.body.innerHTML = `
        <div class="feed">
          <div class="comment" id="c1"><a href="/@alice">Alice</a><p>first</p><span>x</span></div>
          <div class="comment" id="c2"><a href="/@alice">Alice</a><p>second</p><span>x</span></div>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments.map((c) => c.container.id).sort()).toEqual(['c1', 'c2']);
      expect(comments.every((c) => c.username === 'alice')).toBe(true);
    });

    it('still finds a later comment by the same user once the first is marked', () => {
      document.body.innerHTML = `
        <div class="feed">
          <div class="comment" id="c1"><a href="/@alice">Alice</a><p>first</p><span>x</span></div>
        </div>
      `;
      const [first] = observer.findComments(document.body);
      observer.markProcessed(first.container, first.username);

      // Second comment by the same user loads later (virtual scroll / reply)
      document
        .querySelector('.feed')
        .insertAdjacentHTML(
          'beforeend',
          `<div class="comment" id="c2"><a href="/@alice">Alice</a><p>second</p><span>x</span></div>`
        );

      const comments = observer.findComments(document.body);
      expect(comments.map((c) => c.container.id)).toEqual(['c2']);
    });

    it('attributes a comment to its author, not to an @mention in its body', () => {
      document.body.innerHTML = `
        <div class="comment" id="c1">
          <a href="/@alice">Alice</a>
          <p>hey <a href="/@bob">@bob</a></p>
          <span>x</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(1);
      expect(comments[0].username).toBe('alice');
    });

    it('a mention does not stop the mentioned user’s own comment from being marked', () => {
      document.body.innerHTML = `
        <div class="feed">
          <div class="comment" id="c1">
            <a href="/@alice">Alice</a><p>hey <a href="/@bob">@bob</a></p><span>x</span>
          </div>
          <div class="comment" id="c2"><a href="/@bob">Bob</a><p>reply</p><span>x</span></div>
        </div>
      `;
      const comments = observer.findComments(document.body);
      const byId = Object.fromEntries(comments.map((c) => [c.container.id, c.username]));
      expect(byId).toEqual({ c1: 'alice', c2: 'bob' });
    });

    // ── 引用貼文:A 內嵌 B,點 B 選 B 的作者,點 A 其餘區域選 A ──

    it('marks a quoted post embedded in a quote post with its own author', () => {
      document.body.innerHTML = `
        <div data-pressable-container id="a">
          <a href="/@alice">Alice</a><p>quoting</p>
          <div data-pressable-container id="b"><a href="/@bob">bob</a><p>post</p><span>x</span></div>
        </div>
      `;
      const comments = observer.findComments(document.body);
      const byId = Object.fromEntries(comments.map((c) => [c.container.id, c.username]));
      expect(byId).toEqual({ a: 'alice', b: 'bob' });
    });

    it('marks an embedded post even when its author was already seen (reply quoting the OP)', () => {
      document.body.innerHTML = `
        <div data-pressable-container id="op-post"><a href="/@op">op</a><p>post</p><span>x</span></div>
        <div data-pressable-container id="c1">
          <a href="/@alice">Alice</a><p>quoting</p>
          <div data-pressable-container id="embed"><a href="/@op">op</a><p>post</p><span>x</span></div>
        </div>
      `;
      const comments = observer.findComments(document.body);
      const byId = Object.fromEntries(comments.map((c) => [c.container.id, c.username]));
      expect(byId).toEqual({ 'op-post': 'op', c1: 'alice', embed: 'op' });
    });

    it('marks a quoted post rendered after the outer post was already marked', () => {
      document.body.innerHTML = `
        <div data-pressable-container id="op-post"><a href="/@op">op</a><p>post</p><span>x</span></div>
        <div data-pressable-container id="c1"><a href="/@alice">Alice</a><p>quoting</p></div>
      `;
      for (const c of observer.findComments(document.body)) {
        observer.markProcessed(c.container, c.username);
      }
      document
        .getElementById('c1')
        .insertAdjacentHTML(
          'beforeend',
          `<div data-pressable-container id="embed"><a href="/@op">op</a><p>post</p><span>x</span></div>`
        );

      const comments = observer.findComments(document.body);
      expect(comments.map((c) => [c.container.id, c.username])).toEqual([['embed', 'op']]);
    });

    it('does not mark a non-embed fragment of a comment body (e.g. around an @mention)', () => {
      document.body.innerHTML = `
        <div class="comment" id="c1">
          <a href="/@alice">Alice</a>
          <div class="body" id="frag"><span>hey</span><a href="/@bob">@bob</a><span>!</span></div>
          <span>x</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments.map((c) => [c.container.id, c.username])).toEqual([['c1', 'alice']]);
    });

    it('returns container and link references', () => {
      document.body.innerHTML = `
        <div class="comment">
          <a href="/@carol">Carol</a>
          <p>hello</p>
          <span>world</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments[0].container).toBeInstanceOf(Element);
      expect(comments[0].link).toBeInstanceOf(Element);
      expect(comments[0].link.tagName).toBe('A');
    });
  });

  // ── markProcessed ─────────────────────────────────────────────────────────

  describe('markProcessed', () => {
    it('sets data-tb-comment-id on the element', () => {
      document.body.innerHTML = `<div id="target"></div>`;
      const el = document.getElementById('target');
      observer.markProcessed(el, 'testuser');
      expect(el.getAttribute(COMMENT_ID_ATTR)).toBe('testuser');
    });

    it('causes findComments to skip a previously detected element', () => {
      document.body.innerHTML = `
        <div class="comment">
          <a href="/@dave">Dave</a>
          <p>text</p>
          <span>x</span>
        </div>
      `;
      const first = observer.findComments(document.body);
      expect(first).toHaveLength(1);
      observer.markProcessed(first[0].container, first[0].username);
      const second = observer.findComments(document.body);
      expect(second).toHaveLength(0);
    });
  });

  // ── startObserving / stopObserving ────────────────────────────────────────

  describe('startObserving / stopObserving', () => {
    it('calls onNewComments when new comment nodes are added', async () => {
      const received = [];
      observer.startObserving((comments) => {
        received.push(...comments);
      });

      const div = document.createElement('div');
      div.innerHTML = '<a href="/@eve">Eve</a><span>text</span><span>x</span>';
      document.body.appendChild(div);

      // MutationObserver callbacks fire asynchronously; wait for debounce
      await new Promise((r) => setTimeout(r, 150));

      expect(received.length).toBeGreaterThan(0);
      expect(received[0].username).toBe('eve');

      observer.stopObserving();
    });

    it('does not call onNewComments after stopObserving', async () => {
      const received = [];
      observer.startObserving((comments) => {
        received.push(...comments);
      });
      observer.stopObserving();

      const div = document.createElement('div');
      div.innerHTML = '<a href="/@frank">Frank</a><span>text</span><span>x</span>';
      document.body.appendChild(div);

      await new Promise((r) => setTimeout(r, 150));
      expect(received).toHaveLength(0);
    });
  });

  // ── findComments:dialog user list rows(按讚名單等,row 沒有 <a>) ──────────

  describe('findComments – dialog user list rows', () => {
    function likerRow(username, alt) {
      return `
        <div class="liker-row">
          <div><div><img alt="${alt}"></div></div>
          <div><div data-pressable-container>
            <span>${username}</span>
            <time aria-label="3分鐘前"><span>3分鐘</span></time>
            <div role="button"><div>追蹤</div></div>
          </div></div>
        </div>`;
    }

    it('includes user list rows alongside anchor-based comments', () => {
      document.body.innerHTML = `
        <div class="comment"><a href="/@alice">Alice</a><p>text</p><span>x</span></div>
        <div role="dialog">
          ${likerRow('zy___t.t', 'zy___t.t的大頭貼照')}
        </div>
      `;

      const comments = observer.findComments(document.body);
      expect(comments.map((c) => c.username).sort()).toEqual(['alice', 'zy___t.t']);
    });

    it('skips user list rows whose container is already marked', () => {
      document.body.innerHTML = `
        <div role="dialog">
          ${likerRow('zy___t.t', 'zy___t.t的大頭貼照')}
        </div>
      `;

      const first = observer.findComments(document.body);
      expect(first).toHaveLength(1);
      observer.markProcessed(first[0].container, first[0].username);

      expect(observer.findComments(document.body)).toHaveLength(0);
    });

    it('marks both the comment and the user list row of the same username', () => {
      document.body.innerHTML = `
        <div class="comment"><a href="/@zy___t.t">zy</a><p>text</p><span>x</span></div>
        <div role="dialog">
          ${likerRow('zy___t.t', 'zy___t.t的大頭貼照')}
        </div>
      `;

      // Two distinct containers — each must be clickable in block mode,
      // otherwise the unmarked one navigates away and drops the selection.
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(2);
      expect(new Set(comments.map((c) => c.container)).size).toBe(2);
      expect(comments.every((c) => c.username === 'zy___t.t')).toBe(true);
    });
  });

  // ── getMarkedComments ────────────────────────────────────────────────────

  describe('getMarkedComments', () => {
    it('returns all marked comments', () => {
      document.body.innerHTML = `
        <div ${COMMENT_ID_ATTR}="user1">User 1</div>
        <div ${COMMENT_ID_ATTR}="user2">User 2</div>
      `;
      const marked = observer.getMarkedComments();
      expect(marked).toHaveLength(2);
      expect(marked.map((m) => m.username).sort()).toEqual(['user1', 'user2']);
    });
  });
});
