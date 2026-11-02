# Ticket 23：真实模型 Agent 评测报告

## 判定与门禁

**结果：blocked-awaiting-authorization（等待授权，暂时阻塞）。** 未使用任何模型提供商、付费 API 调用、需授权门控权重下载或外部副作用。本契约是计划与证据格式，不是实际运行声明。`live_eval_contract.json` 中的 `null` 表示没有可用测量，不表示零。

任何真实调用之前，批准人必须按 `authorization_gate.md` 记录执行路径、模型标识与固定 revision、数据条件、上限与停止行为。确定性门禁为：

```bash
python projects/agent_learning/evidence/validate_contract.py
python projects/agent_learning/evidence/validate_contract.py --require-authorized  # 目前按预期失败
```

在取得具体批准前，第二条命令必须失败，未来的运行器也必须在门禁前拒绝启动。

## 选定计划与固定任务集

`model_selection_plan.md` 以版本、访问、数据使用与成本条件比较了一个开放权重本地 instruct 模型（推荐）和三个提供商 API 候选；它只是提案，未选定任何模型。契约在 `summarize-notes` 夹具上固定六个任务：一个成功任务、两个畸形请求任务（invalid_arguments 与未注册工具）、一个缺失资源失败、一个步骤预算耗尽、一个终止诚实性任务。每个任务都标注 `deterministic-v1` 对应物与可检查的预期观测。

## 证据契约与当前观测

指标可独立核查，不依赖模型自述：report 内容与夹具期望一致（已记录 SHA-256）、仅出现已注册工具名、步骤/重试上限、结构化错误观测与诚实的终止、逐任务基线对比、实测成本。基线值来自确定性夹具；所有 `live_value` 在授权运行填入前保持 `null`。

目前只存在 deterministic-v1 夹具运行，只验证运行机制（action/observation 轨迹、有界工具、重试、预算、安全终止），不是真实模型证据。不声称任何提供商、模型 ID、revision、耗时、token 数、任务结果或成本，这些字段全为 `null`。`simulated` 与 `live` 的分离由验证器和 `evidence_kind` 标签强制保证。授权后按契约配置跑完六个任务，写入 `live_results`，凭证留在仓库外，并同步更新全部四语种报告。
