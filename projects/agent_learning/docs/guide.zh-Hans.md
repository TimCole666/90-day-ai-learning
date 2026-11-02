# 有界 Agent 项目——简体中文版

Ticket 23 的真实模型评测证据包（授权门禁、固定任务集、未测量值 null、四语言报告）位于 [`../evidence/`](../evidence/)。当前没有真实模型调用，仍等待授权。

**目标：** 在不连接真实 LLM 的情况下，构建并评估一个有用的小型工具调用 Agent。

**运行：** `python -m projects.agent_learning.cli evaluate --fixture summarize-notes --output /tmp/agent-run.json`

**练习：** 先预测 `list_notes → read_note(alpha.txt) → read_note(beta.txt) → write_report`；运行命令；检查每个动作和观察；再在一次性的临时目录中练习 `DeterministicModelAdapter(fault="invalid_arguments")`、`fault="missing_note"` 和 `fault="loop"`。

**反馈：** `invalid_arguments` 必须可见并在重试预算内得到修正；`not_found` 必须安全失败且不生成报告；`budget_exhausted` 必须在声明的步骤上限停止。不要把进程退出码 0 或模型文字当作评测证据。

**评量：** 独立核对报告内容、已注册工具及参数、步骤/重试上限、结构化失败观察，以及没有隐藏推理字段。资源限制不是操作系统沙箱保证；真实模型/提供商成功不在本项目范围内。
