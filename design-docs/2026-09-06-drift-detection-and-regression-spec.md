# Spec: Threads 站方改版偵測（drift detection）與功能 regression 工具

日期：2026-09-06
狀態：已定案（經逐項決策確認）
取代關係：延伸 `2026-04-12-testing-infrastructure-design.md` 的 e2e 章節；現有真站 e2e 的定位由本 spec 重新劃分。

## Problem Statement

Thread Blocker 完全依賴 threads.com 的 DOM 結構、token 供應方式與 GraphQL 介面。站方隨時可能改版，而目前唯一的發現方式是「使用者實際用到壞掉」——沒有任何主動偵測機制。現有 Playwright e2e 直接打真站，flaky 到 CI 只敢手動觸發，既當不了改版警報，也當不了穩定的功能驗證。

使用者的兩個痛點，依優先序：

1. **主要**：threads.com 站方更新時，希望能主動知道，而不是被動踩到。
2. **次要**：自己改動 code 後，希望有一套穩定、可重複的方式驗證所有情境沒被改壞。

## Solution

雙層架構，兩個痛點各由一層負責、各自獨立演進：

- **Phase 1 — Site Contract Canary（主體）**：把 extension 對 threads.com 的每一項假設整理成一份系統性的「site contract」斷言清單，用 Playwright 對真站逐項驗證。輸出一份三分類的失敗報告（`drift` / `credential-expired` / `infra`），讓「站方改版」與「憑證過期」「網路問題」一眼可分。初期完全在本機執行，使用者每天手動跑一次。
- **Phase 2 — Threads Simulator 功能 regression（次體，後做）**：可程式化的本地 Threads 模擬頁面 + API 回應 scenario engine，讓全部功能情境（UI injection、封鎖流程、錯誤處理、queue 操作）能在無外部網路依賴下穩定重複驗證。

兩層的關係：canary 失敗（drift）是 simulator 樣板需要同步更新的訊號來源。

## User Stories

1. 身為 extension 維護者，我想每天跑一個指令就能知道 threads.com 有沒有改版，這樣我能在使用者（我自己）踩到之前主動修復。
2. 身為 extension 維護者，我想在報告中一眼區分「站方改版」「登入憑證過期」「網路／環境問題」，這樣我不會被誤報淹沒、也不會把憑證過期誤判成改版。
3. 身為 extension 維護者，我想知道 site adapter 依賴的每一個 selector（username 連結、留言容器、各層 fallback）是否仍能在真站命中，這樣 selector 失效這種最常見的壞法能被逐項點名。
4. 身為 extension 維護者，我想知道 token 供應來源（csrftoken cookie、頁面內 DTSG / LSD token）是否仍以預期形式存在，這樣 token 解析失效能被提前發現。
5. 身為 extension 維護者，我想知道支援頁面的 path patterns 是否仍符合真站路由，這樣 extension 不會在該啟用的頁面沉默失效。
6. 身為 extension 維護者，我想用登入態驗證 block 與 unblock 兩個 GraphQL mutation 的 doc_id 仍有效、回應 schema 未改，這樣 API 層的改版不用等到實際封鎖失敗才發現。
7. 身為 extension 維護者，我想讓 API 層驗證只作用在我自己準備的犧牲帳號上（block 後立即 unblock），這樣偵測行為完全可逆、對外零影響。
8. 身為 extension 維護者，我想把登入憑證留在本機、不上傳任何雲端服務，這樣風險面最小。
9. 身為 extension 維護者，我改完 code 後想用一個指令在本地跑完全部功能情境，這樣不需要手動在真站逐一操作驗證。
10. 身為 extension 維護者，我想在模擬環境裡精確重現「第 N 次 API 呼叫回 429／401／timeout」這類序列，這樣 rate-limit cooldown、token refresh、transient retry 等錯誤路徑能被確定性地測到。
11. 身為 extension 維護者，我想驗證 UI injection 生命週期的每一項（首次掛載、SPA 導航重掛、re-render 防重複、延遲出現的目標、CSS 隔離、unmount），這樣 ui-injection 規則的 checklist 有自動化對應。
12. 身為 extension 維護者，我想驗證批次封鎖的完整 happy path（偵測留言 → 選取 → 進 queue → resolve → block → 面板狀態更新），這樣核心流程的 regression 能被抓到。
13. 身為 extension 維護者，我想驗證 queue 的所有操作（unblock、retry failed、pause / resume、clear），這樣操作面的 regression 不會漏。
14. 身為 extension 維護者，我想讓模擬頁面的 DOM 樣板來自真站實際錄製的結構（而非用猜的），這樣模擬環境對 site adapter 的忠實度有依據。
15. 身為 extension 維護者，我想在測試失敗時看到可讀的斷言訊息（哪個 contract 項目、哪個情境、期望與實際），這樣不用翻 trace 就能定位。
16. 身為 extension 維護者，我希望未來工具穩定後可以選擇把 canary 排上 CI nightly 並自動開 issue，這樣連「每天手動跑」都可以省掉——但這是後續選項，不是初期需求。

## Implementation Decisions

以下決策皆已逐項確認定案：

### 架構與優先序

- 採**雙層架構**：真站 canary 負責 drift 偵測，本地 simulator 負責功能 regression。兩者職責不混：canary 不做功能斷言，simulator 不打外網。
- **優先序：drift 偵測是主要目標，功能 regression 是次要目標**。Phase 1 全力做 canary，simulator 為 Phase 2。

### Phase 1 — Site Contract Canary

- Canary 的核心產物是一份 **site contract**：將 site adapter 的所有 selector（含三層容器 fallback 各自的命中條件）、token 供應來源、支援頁面 path patterns、GraphQL doc_id 逐項列成獨立斷言，每項失敗能單獨點名。
- 偵測深度為**頁面層 + API 層**：
  - 頁面層：未登入與登入態下，逐項驗證 selector 命中、token 來源存在、shadow host 可掛載。
  - API 層：以登入態對**使用者自備的犧牲帳號**執行 block → 驗證回應 schema → 立即 unblock，同時驗證兩個 mutation 的 doc_id 有效性。操作可逆、對外零影響。頻率為每日一次，行為模式風險已知且接受。
- **初期不上 CI，全部本機執行**：使用者每天手動跑一次單一指令。登入憑證（session cookie）存放本機（gitignored 的本地設定檔），不進任何雲端 secret。
- 失敗報告**三分類**：
  - `drift`：憑證有效、網路正常，但 contract 項目失敗 → 站方改版，需要人工介入。
  - `credential-expired`：session 有效性前置檢查失敗 → 重新登入更新本機憑證即可，不是改版。
  - `infra`：頁面根本載不進來、網路逾時 → 環境問題，重跑即可。
  - 判定順序：先驗 infra（頁面可達），再驗 credential（session 有效），最後才跑 contract 斷言——確保 drift 分類的訊號純度。
- **現有四個真站 e2e spec 改造為 canary suite**：保留其中的載入／selector 命中／掛載煙霧測試並擴充為完整 contract 檢查；其中的功能性斷言（queue 顯示、錯誤處理載入）移交 Phase 2 simulator suite。現有的 extension 載入 fixture 與 GraphQL mock 基礎設施沿用。
- **後續選項（非初期範圍）**：canary 穩定後，可評估改上 GitHub Actions nightly cron + 憑證入 Secrets + 失敗自動開 issue（label 對應三分類）。spec 保留此路徑但不在初期實作。

### Phase 2 — Threads Simulator 功能 regression

- Fixture 形態為**可程式化的 Threads simulator**：本地 harness 頁面，DOM 結構樣板**必須來自真站錄製**（提供單一錄製 script，於真站 console 執行一次、輸出結構 JSON），遵守 ui-injection 規則的 debug-first 原則，不猜 DOM。樣板保留 site adapter 依賴的全部特徵（username 連結 pattern、容器標記屬性、obfuscated class 形態、深淺色）。
- Simulator 提供控制 API：注入 N 則留言、延遲載入、觸發 SPA route change、強制 re-render、切換深淺色——精確重現 ui-injection checklist 的動態情境。
- API 層 mock **擴充現有 Playwright route 攔截機制成 scenario engine**：每個測試可宣告回應序列（第 N 次呼叫回 429 / 401 / timeout / 200）、可斷言收到的 mutation payload（doc_id、user_id、headers）。不另起 mock server。
- 第一版覆蓋四類情境：(1) UI injection 生命週期、(2) 批次封鎖 happy path、(3) 錯誤處理（429 cooldown、401 refresh、transient retry、permanent fail）、(4) queue 操作（unblock / retry / pause / resume / clear）。
- Simulator suite 同樣**本地手動跑**（獨立的單一指令，與 canary 分開），穩定後再評估是否進 CI。
- Canary 的 `drift` 報告是 simulator 樣板更新的觸發訊號：真站改版 → canary 點名失效項目 → 重跑錄製 script → 更新樣板與 site adapter。

## Testing Decisions

- **只斷言外部可觀察行為**：Shadow DOM 內的元素存在／文字／狀態 class，以及 `chrome.storage.local` 的持久化狀態（queue 內容、cooldown 時間戳）。不斷言模組內部實作細節。
- **DOM / state 斷言為主，不做截圖比對**：純視覺崩壞（樣式跳掉、z-index 被蓋）由 ui-injection 規則既有的人工驗證步驟涵蓋，不進自動化範圍。
- 斷言訊息必須自帶語境：contract 項目名稱或情境名稱、期望值、實際值。
- Prior art：既有 Playwright e2e 的 extension 載入 fixture 與 GraphQL 攔截 mock 是直接沿用的基礎；Jest 單元測試（node + jsdom 雙 project）維持現狀，繼續負責模組層級的邏輯驗證，與本 spec 的兩層互補、不重疊。
- Seam 選擇：全部沿用最高的既有 seam——Playwright 驅動真實瀏覽器 + 載入實際 build 產物 + route 層攔截網路。不新增 seam。

## Out of Scope

- **CI 整合**（PR gate、nightly cron、Secrets、自動開 issue）：初期不做，穩定後另行評估。
- **截圖 / 視覺 regression**。
- 情境 (5) Service Worker 重啟後 persistence 恢復、(6) 多分頁 queueNotify 同步、(7) selection 範圍選取與虛擬捲動追蹤：列為 Phase 2 之後的 backlog，其模擬成本高（CDP hack、多 context、捲動回收），不納入第一版。
- 自動化登入流程（自動取得 session cookie）：憑證由使用者手動登入後提供，過期時由 canary 的 `credential-expired` 分類提醒。

## Further Notes

### 風險（明列）

- **犧牲帳號風控**：每日一次 block / unblock 的規律行為仍可能被 Meta 風控標記；頻率低、可接受，但若帳號被限制，API 層偵測退化為頁面層。
- **canary 對真站的本質依賴**：threads.com 對自動化瀏覽器的偵測若加嚴，`infra` 分類的誤判率會上升；屆時再評估對策。
- **simulator 忠實度衰減**：真站改版而 simulator 未同步時，功能 regression 會出現虛假的綠燈。緩解機制就是 canary 的 drift 訊號驅動樣板更新——這也是雙層必須一起存在的理由。
- **手動執行的遺忘風險**：初期靠使用者自律每天跑；若實際執行頻率遠低於預期，應提前啟動「後續選項」中的 CI nightly。

### 實作階段切分（供後續開工參考）

1. Phase 1a：site contract 清單整理 + 頁面層 canary + 三分類報告 + 本機憑證載入。
2. Phase 1b：API 層驗證（犧牲帳號 block / unblock + schema 斷言）。
3. Phase 1c：舊 e2e spec 收斂改造，功能斷言標記待遷移。
4. Phase 2a：真站錄製 script + simulator 骨架 + scenario engine。
5. Phase 2b：四類情境 spec 補齊，舊 spec 功能斷言遷入。
