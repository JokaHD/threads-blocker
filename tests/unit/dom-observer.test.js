/** @jest-environment jsdom */

import { DOMObserver, COMMENT_ID_ATTR } from '../../src/content/dom-observer.js';
import { threadsSiteRule } from '../../src/content/site-adapter.js';

// Mock location for jsdom
beforeAll(() => {
  delete window.location;
  window.location = { href: 'https://www.threads.com/@user/post/123' };
});

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

  // ── getMarkedComments ────────────────────────────────────────────────────

  describe('getMarkedComments', () => {
    it('returns all marked comments', () => {
      document.body.innerHTML = `
        <div ${COMMENT_ID_ATTR}="user1">User 1</div>
        <div ${COMMENT_ID_ATTR}="user2">User 2</div>
      `;
      const marked = observer.getMarkedComments();
      expect(marked).toHaveLength(2);
      expect(marked.map(m => m.username).sort()).toEqual(['user1', 'user2']);
    });
  });
});
