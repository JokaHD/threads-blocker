/**
 * Canary reporter — folds Playwright results into the three-way verdict the
 * canary exists for:
 *
 *   INFRA               threads.com 連不上（環境問題，重跑即可）
 *   CREDENTIAL_EXPIRED  本機 session 失效（npm run canary:login 後重跑）
 *   DRIFT               contract 斷言失敗 → threads.com 改版了
 *
 * Precedence: infra > credential > drift — a broken lower stage would make
 * upper-stage failures meaningless, and Playwright project dependencies
 * already skip dependents, so the first failing stage IS the verdict.
 *
 * Also writes .canary/last-run.json for future automation (nightly CI,
 * auto-issue) without having to re-parse terminal output.
 */

import fs from 'node:fs';

const STAGE_BY_PROJECT = {
  infra: 'infra',
  credential: 'credential',
  'contract-public': 'contract',
  'contract-authed': 'contract',
};

const STAGE_LABEL = {
  infra: 'INFRA',
  credential: 'CREDENTIAL',
  contract: 'CONTRACT',
};

export default class CanaryReporter {
  constructor() {
    // keyed by test.id — onTestEnd fires once per retry attempt and the
    // last write wins, so retries never double-count
    this.results = new Map();
  }

  onTestEnd(test, result) {
    const stage = STAGE_BY_PROJECT[test.parent.project()?.name];
    if (!stage) return;
    this.results.set(test.id, {
      stage,
      title: test.title,
      outcome: test.outcome(), // 'expected' | 'unexpected' | 'flaky' | 'skipped'
      messages: result.errors
        .map((e) => firstLine(e.message))
        .filter(Boolean)
        .slice(0, 10),
    });
  }

  onEnd() {
    const stages = {
      infra: { passed: 0, failed: 0, skipped: 0, flaky: 0, failures: [] },
      credential: { passed: 0, failed: 0, skipped: 0, flaky: 0, failures: [] },
      contract: { passed: 0, failed: 0, skipped: 0, flaky: 0, failures: [] },
    };
    for (const r of this.results.values()) {
      const bucket = stages[r.stage];
      if (r.outcome === 'skipped') bucket.skipped++;
      else if (r.outcome === 'unexpected') {
        bucket.failed++;
        bucket.failures.push({ title: r.title, messages: r.messages });
      } else {
        bucket.passed++;
        if (r.outcome === 'flaky') bucket.flaky++;
      }
    }

    const verdict = computeVerdict(stages);
    const lines = [];
    lines.push('');
    lines.push('════════ Thread Blocker Canary 報告 ════════');
    for (const [stage, bucket] of Object.entries(stages)) {
      lines.push(`[${STAGE_LABEL[stage].padEnd(10)}] ${summarize(bucket)}`);
      for (const failure of bucket.failures) {
        lines.push(`    ✗ ${failure.title}`);
        for (const message of failure.messages) lines.push(`        ${message}`);
      }
    }
    lines.push('─'.repeat(44));
    lines.push(`結論：${VERDICT_TEXT[verdict]}`);
    lines.push('');
    console.log(lines.join('\n'));

    fs.mkdirSync('.canary', { recursive: true });
    fs.writeFileSync(
      '.canary/last-run.json',
      JSON.stringify({ at: new Date().toISOString(), verdict, stages }, null, 2)
    );
  }

  printsToStdio() {
    return false;
  }
}

function computeVerdict(stages) {
  if (stages.infra.failed > 0) return 'INFRA';
  if (stages.credential.failed > 0) return 'CREDENTIAL_EXPIRED';
  if (stages.contract.failed > 0) return 'DRIFT';
  // 只跑部分 project（--project 篩選）時不給綠燈結論
  if (stages.contract.passed === 0) return 'INCOMPLETE';
  return 'OK';
}

const VERDICT_TEXT = {
  OK: '🟢 OK — 全部 contract 項目通過，threads.com 沒有可偵測的改版',
  INFRA: '⚪ INFRA — threads.com 連不上，環境問題（非改版），稍後重跑',
  CREDENTIAL_EXPIRED: '🟡 CREDENTIAL — 本機 session 失效，跑 npm run canary:login 後重跑（非改版）',
  DRIFT: '🔴 DRIFT — contract 斷言失敗，threads.com 可能已改版，檢查上面逐項清單',
  INCOMPLETE: '⚪ INCOMPLETE — contract 檢查未執行（部分執行或全數跳過），不構成結論',
};

function summarize(bucket) {
  const parts = [];
  if (bucket.failed > 0) parts.push(`❌ ${bucket.failed} 失敗`);
  if (bucket.passed > 0) parts.push(`✅ ${bucket.passed} 通過`);
  if (bucket.flaky > 0) parts.push(`⚠️ 其中 ${bucket.flaky} 重試後過（flaky）`);
  if (bucket.skipped > 0) parts.push(`⏭️ ${bucket.skipped} 跳過`);
  return parts.length > 0 ? parts.join('、') : '（未執行）';
}

function firstLine(message) {
  if (!message) return '';
  // strip ANSI color codes so the summary stays readable
  // eslint-disable-next-line no-control-regex
  const clean = message.replace(/\x1b\[[0-9;]*m/g, '');
  return clean.split('\n').find((l) => l.trim()) ?? '';
}
