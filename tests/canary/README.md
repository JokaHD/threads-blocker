# Canary — threads.com 改版偵測

對真站逐項驗證 extension 依賴的「site contract」，回答一個問題：**threads.com 是不是改版了？**
（功能 regression 不在這裡——見 design doc 的 Phase 2 simulator。）

## 日常使用

```bash
npm run canary
```

每天跑一次。結尾會有三分類結論：

| 結論 | 意思 | 你要做什麼 |
| --- | --- | --- |
| 🟢 OK | contract 全過 | 沒事 |
| ⚪ INFRA | threads.com 連不上 | 環境問題，稍後重跑 |
| 🟡 CREDENTIAL | 本機 session 失效 | `npm run canary:login` 後重跑 |
| 🔴 DRIFT | contract 斷言失敗 | **站方改版了**，看報告的逐項清單修 site-adapter / token-provider |

## 首次設定（登入態檢查用）

```bash
npm run canary:login
```

會開一個瀏覽器讓你手動登入 threads.com（不做自動登入，避免觸發風控），
登入後 session 自動存到 `.canary/state.json` — **gitignored，不離開本機**。
沒有這個檔案時，登入態的檢查會標記 skip，其餘照跑。

## 架構

- **Probe（`probe/probe-entry.js`）**：esbuild 把 `src/content/site-adapter.js` 與
  `src/content/token-provider.js` bundle 後注入真站頁面執行——canary 驗的是
  extension 實際出貨的邏輯，不是另一套複製的 selector。
- **三階段 project**（`playwright.canary.config.js`）：`infra` → `credential` →
  `contract`（public / authed）。前一階段失敗時後面自動跳過，所以「第一個失敗的
  階段」就是結論分類，drift 不會被環境問題或過期憑證污染。
- **報告（`reporter.js`）**：終端輸出中文報告，並寫 `.canary/last-run.json`
  供未來自動化（nightly CI、自動開 issue）使用。

## Contract 項目對照

| 檢查 | 來源假設 |
| --- | --- |
| `a[href^="/@"]` username 連結命中 | `site-adapter.js` usernameSelector |
| `data-pressable-container` 存在 + findContainer priority 1 命中 | `site-adapter.js` findContainer |
| `csrftoken` cookie | `token-provider.js` _getCsrfToken |
| `DTSGInitialData` token 可抽出（登入態） | `token-provider.js` _getFbDtsg |
| `LSD` token 可抽出 | `token-provider.js` _getLsd |
| `nav / [role="navigation"]` 存在 | `site-adapter.js` isNavigationLink 排除規則 |
| `/`、`/@user`、`/search` 路由存活且屬支援頁面 | `site-adapter.js` SUPPORTED_PATH_PATTERNS |
| extension 掛載 `#tb-shadow-host` + `.tb-fab`（真站 smoke） | 整條 content script 啟動鏈 |

尚未涵蓋（後續）：dialog user-list rows（讚名單，需登入互動）、GraphQL doc_id
有效性與回應 schema（Phase 1b：犧牲帳號 block/unblock）。
