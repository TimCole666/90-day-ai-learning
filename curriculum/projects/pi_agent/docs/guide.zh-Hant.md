# Pi Agent Tool Track（繁體中文）

本路線使用 Pi 完成共用的 Agent 協同工程檢查。Pi 是可擴充的 agent harness，不是模型供應商。官方資料已在 2026-10-30 對照 `v1.4.0`：https://github.com/earendil-works/pi/releases/tag/v1.4.0；需要 Node.js `>=22.19`。

## 安裝、存取與成本

```sh
curl -fsSL https://pi.dev/install.sh | sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0
pi --version
```

在隔離專案執行 `pi`，以 `/login` 或官方 provider 設定接入已獲准的 provider/model。記錄 `provider`、`model`、`model_version`、日期與預算；本倉庫沒有金鑰，也沒有宣稱完成 live provider 執行。Pi 本身不收模型費用；token、訂閱、本地電力和託管推理費由 provider 收取。付費存取和購買必須逐項授權。

## 內建能力與擴充

v1.4.0 內建互動、print/JSON、工作階段與上下文、壓縮/分支、模型選擇，以及檔案讀寫、grep、find、bash 工作流。官方 README 明確表示 Pi 不內建 sub-agent delegation 或 plan mode；不得宣稱為原生能力。extensions、skills、prompt templates、themes、packages、MCP 與 SDK 都是擴充邊界，第三方程式碼須先審計和獲准。

## 練習、故障、答案與驗收

使用 `curriculum/projects/pi_agent/fixture`，只提供失敗測試、相關函式與驗收標準；寫入限於隔離目錄，拒絕網路、部署、憑據和安裝。每次寫入後檢查 `git status`、`git diff --check`，並親自執行 `python3 -m unittest discover -s tests`。練習中的 secret、刪除斷言、webhook 和無關依賴必須被拒絕並恢復。脫敏 `run-record.json`、真實退出碼、diff 和根因說明才是證據；simulation 不得冒充 live。命令找不到檢查 Node/PATH；登入失敗檢查 provider/model/區域/額度；上下文過大刪除無關檔案；意外修改先停止並保存 diff；重複失敗時一次只改一處。

參考答案必須識別密鑰洩露、刪除測試、外發 webhook 和依賴漂移，恢復隔離專案並獨立執行測試。Pi 的文字聲稱不是證據。Agent 協同檢查須有上下文、權限、成本、diff、測試、故障修正和證據；沒有 provider 存取應標為 blocked。獨立掌握檢查不得使用 Pi。擴充安裝、付費請求、外發訊息、部署和隔離目錄外的變更都需要單獨授權。
