# Claude Code 代理工具路線

**路線狀態：** 課程內容已完成；真實工具驗收**因等待授權而阻塞**。
**驗證日期：** 2026-10-30（僅審查了文件和確定性 fixture；未發出任何付費請求）。
**觀察到的工具版本：** `claude 2.1.312`（`claude --version`）。不要根據 CLI 版本推斷模型或提供者。

## 官方資料與存取

使用 [Claude Code overview](https://docs.claude.com/en/docs/claude-code/overview)、[setup](https://docs.claude.com/en/docs/claude-code/setup)、[permissions](https://docs.claude.com/en/docs/claude-code/permissions)、[settings](https://docs.claude.com/en/docs/claude-code/settings) 和 [costs](https://docs.claude.com/en/docs/claude-code/costs) 頁面。CLI、參數、模型和價格都會變動，真實執行前請再次確認。

學習者需要一個已授權的 Anthropic 帳號，以及已核准的 Claude Code 登入／訂閱途徑，或一把有可用額度的 Anthropic API 金鑰。課程不提供憑證。真實執行可能產生計費的 API 用量；**未經學習者明確授權，不要登入、新增付款方式或花錢。** 提供者是 Anthropic。模型由已授權的帳號／設定決定，本練習不假定固定模型。請記錄真實執行當天使用的模型名稱和價格頁面。`ANTHROPIC_API_KEY` 絕不能提交到儲存庫，也不能寫進提示詞。

## 可重現的安裝與受限設定

```sh
# 在一次性 clone／worktree 中，取得授權後執行：
claude --version                 # 記錄觀察到的版本
claude login                     # 或使用已授權的帳號
claude                           # 從 fixture 目錄啟動
```

接受工具操作之前，先檢查權限提示。從目前版本提供的最小權限開始；使用文件中的 permissions／settings 機制，不要複製未經審查的設定。拒絕網路、部署、憑證、破壞性以及 worktree 之外的操作。設定較短的工作階段期限、最多兩輪修正，以及學習者核准的費用上限。可用時使用 `/cost`，並在不含機密的前提下記錄顯示的提供者／模型／費用。具體的權限參數和設定名稱隨版本變動：請以上面連結的官方 permissions／settings 頁面為準，並記錄實際選擇的內容。

## 一次性練習

把 `projects/claude-code-disposable/` 複製到暫存目錄或 worktree。只給代理提供簡短的錯誤報告、`src/greeter.py` 和 `tests/test_greeter.py`，並要求它只修改 `src/greeter.py`。fixture 中有一個刻意失敗的測試：代理必須先觀察到失敗，做最小的修改，執行測試並回報結束碼。接著學習者獨立執行測試，審查 `git diff --check` 和 `git diff`，並拒絕 `src/greeter.py` 以外的任何檔案變更。第二輪提示必須修正一個刻意錯誤的首次結果（預期的問候語區分大小寫）；失敗結果和修正後的結果都要記錄。

必要的本機證據指令：

```sh
cd projects/claude-code-disposable
python3 verify_fixture.py
```

公開的驗證腳本會建立一個暫存 Git 儲存庫，記錄刻意失敗的測試，只套用受限的首字母大寫修正，重新執行測試，並檢查 `git diff --check` 和變更路徑清單。如果真的執行了 Claude Code，請在工具結束後自己執行同樣的指令；驗證腳本只是確定性的替代品。

第一條指令是**確定性替代品**，不能證明 Claude Code 執行過。它在無法取得授權時有用。`docs/evidence/claude-code/` 中經過去識別化的產物只是文件／fixture 證據，不得當作真實工具的紀錄展示。只有當學習者提交去識別化後的紀錄或指令日誌，顯示真實的 Claude Code 版本、所選提供者／模型、權限決定、費用（或方案／額度）、失敗、修正、獨立測試輸出和已審查的差異時，真實執行才會被驗收。絕不要包含 API 金鑰、帳號識別碼、含機密的提示內容或外部副作用。

## 驗收標準

- [ ] 已在執行當天確認安裝步驟和官方資料連結。
- [ ] 已記錄版本、提供者、模型、存取途徑、費用／方案假設和授權情況。
- [ ] 上下文最小，權限受限，專案是一次性的。
- [ ] 已逐行審查真實代理的變更，且變更僅限於指定檔案。
- [ ] 學習者執行的測試附有結束碼，展示了刻意的失敗和修正後的成功。
- [ ] 去識別化後的真實執行證據與本 fixture 和文件審查分開存放。

**目前限制：** 本環境可以觀察到 `claude 2.1.312`，但沒有提供已授權的 Anthropic 帳號／API 金鑰。沒有發出任何付費或外部的 Claude Code 呼叫，因此真實執行這一項保持阻塞，而不是用模擬填補。
