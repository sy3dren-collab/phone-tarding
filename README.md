# 手機版 K 棒複盤系統

## 啟動（Windows / macOS / Linux）

1. 解壓縮 ZIP，打開 `mobile-k-replay` 資料夾。
2. 電腦安裝 Node.js（最低 18，建議使用仍受支援的 LTS 版本）。
3. 在此資料夾開啟終端機，執行：

```sh
npm start
```

4. 用瀏覽器開啟 http://127.0.0.1:8080 。關閉時在終端機按 Ctrl+C。

沒有第三方 npm 依賴，不需要 npm install，也不需要 API 金鑰或 .env。
請透過 HTTP 伺服器開啟，不能直接雙擊 index.html，否則內建行情的 fetch 可能失敗。

若已有 Python 3，也可在專案根目錄執行：

```sh
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

## 手機測試

電腦和手機需連上同一個 Wi-Fi。Windows PowerShell 執行：

```powershell
$env:HOST="0.0.0.0"
npm start
```

macOS / Linux：`HOST=0.0.0.0 npm start`。
手機開啟 `http://電腦區域網路IP:8080`，必要時允許私人網路防火牆存取。
此啟動器只用於本機開發；正式上線請以 HTTPS 靜態網站服務發布 dist 資料夾。

## 專案內容與依賴

- `dist/index.html`：畫面結構。
- `dist/style.css`：手機版樣式。
- `dist/app.js`：圖表、播放、交易、停損與互動的完整可編輯原始碼。
- `dist/csv.js`：CSV 解析。
- `dist/storage.js`：瀏覽器 IndexedDB 資料保存。
- `dist/data/`：完整內建行情 JSON，依月份分檔及索引。
- `dist/icon-*.png`、`dist/manifest.webmanifest`：圖示與網頁應用設定。
- `server.cjs`、`package.json`：使用 Node.js 內建模組的開發伺服器與啟動指令。

前端使用瀏覽器原生 Canvas、Fetch、IndexedDB，沒有框架、CDN 或第三方套件。
`dist` 在本專案就是可直接修改的原始碼，不需要編譯或建置。
執行 `npm run check` 可檢查 JavaScript 語法。

## 資料與功能

內建行情為原專案的小台日盤一分 K，共 192,420 根、643 個交易日，範圍 2024-02-01 至 2026-10-01。
交易損益設定為微台：每點 10 元，單邊每口手續費 23 元，市價滑價 5 點。
支援 1 / 5 / 30 分 K、單根／動態播放、當日模式、買賣模擬、可拖曳停損線及 CSV 匯入。
使用者另外匯入的 CSV 儲存在該瀏覽器的 IndexedDB；手機或另一個網址的私人瀏覽器資料不在此 ZIP 中，需重新匯入。

## 交接給 Codex / GitHub

將本資料夾的所有內容上傳到你的 GitHub 儲存庫根目錄（package.json 和 dist 在同一層），再讓 Codex 開啟該儲存庫。
請告訴 Codex：「這是既有手機版複盤專案，請先閱讀 README.md，保留現有功能，直接修改 dist 中的原始碼。用 npm start 啟動，npm run check 檢查。」
新 GitHub 儲存庫不會自動連結原 Sites 網站的發布設定。若要更新原網址，仍需透過原 Sites 專案發布。

## 匯出版本與安全

原始碼版本：`0e04579469d146a54eb958fcde5888fab57d2e53`（前端資源 v19）。
匯出日期：2026-10-15。本次僅增加啟動與說明檔，未修改原有前端邏輯。
不包含 Git 歷史、部署憑證、密碼、API 金鑰、環境變數檔或原網站專屬部署設定。
上一版已加入停損線及圖表觸控事件攔截；iPhone 實機是否仍有整頁位移，需在裝置上再確認。
