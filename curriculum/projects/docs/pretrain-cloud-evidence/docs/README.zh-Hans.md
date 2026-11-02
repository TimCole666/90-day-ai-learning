# Ticket 19：经授权的云 GPU 预训练证据

这是现有可恢复小模型项目 `projects/pretrain` 的云端扩展。当前交付物是**已准备但被阻塞的证据包**，不是云端执行声明。`evidence-package.json` 有意将 provider、GPU、耗时、指标和花费保留为 `null`。

## 付费前审批闸门

在人工明确批准 provider、区域、GPU 型号、模型/数据/运行时假设、25 美元上限和停止行为之前，不得租用 GPU、上传数据或创建付费存储。审批请求在 `approval_gate.request_text` 中；审批必须带范围、批准人和时间。凭据、账户 ID、资源 ID 和私有 provider 页面不进入仓库。

方案是 `cloud-run-config.json` 中的四层、四头、64 维模型，数据为 `tinyshakespeare.txt`（哈希已记录），Python >=3.10、PyTorch >=2.0，并在启动前记录准确 CUDA/驱动版本。理论估算为 2 GPU 小时和 5 GB-天存储；provider 报价、配额、税费、最低计费和账单延迟必须先核实。不假定免费配额，也不承诺 provider 能强制硬上限。

## 授权执行与恢复

批准后，在私有运行日志记录 git、配置/数据哈希、镜像摘要、CUDA/驱动版本和 GPU 身份。按证据包中的 provider 命令执行；达到上限、健康检查失败或计划结束时停止/释放计算。只有得到授权才保留存储，并报告后续存储费用；破坏性删除需要另外确认。

在检查点（例如 step 200）后中断，不要删除 `latest.pt`，再用 `--resume auto` 恢复到同一目标。用独立进程运行 `evaluate.py` 对留出集评估。报告必须包含中断/恢复步数、独立 loss/perplexity、失败案例、耗时、GPU 身份和实际账单快照。

## 证据纪律

理论值来自配置和 provider 报价；测量值只能来自授权运行。不得把 CPU 冒烟测试、合成日志或价格网页填入测量字段。

```sh
PYTHONPATH=. python3 -m unittest discover -s tests/unit -p 'test_cloud_evidence.py'
```

此确定性测试只验证元数据契约，不是云或 GPU 证据。在获得审批并完成真实运行前，Ticket 19 的实际运行验收仍未完成。
