# Ticket 21：已授权云 GPU LoRA 对比

## 判定与门禁

**结果：等待授权，暂时阻塞。** 本工作区没有使用云服务商、付费 GPU、账户、购买或外部变更。该契约是计划与证据格式，不是云端运行声明。`comparison_contract.json` 中的 `null` 表示没有可用测量，不表示零。

付费执行前，批准人必须记录服务商、固定模型 revision、模型和数据权利审核、GPU/运行时间/存储估算、美元上限、检查点策略和停止条件。验证器如下：

```bash
python projects/lora/evidence/validate_contract.py
python projects/lora/evidence/validate_contract.py --require-authorized  # 目前按预期失败
```

在取得具体批准前，第二条命令必须失败，未来运行器也必须在门禁前拒绝启动。

## 对比计划与证据

测试对象是现有 `projects/lora/train.py` 和 `evaluate.py` 的真实模型路径。候选基础模型是经过检查的 immutable revision `openai-community/gpt2`（revision 尚未选择），数据是仓库中的合成 instruction JSONL。固定 seed 42、确定性 80/10/10 切分、rank 8、alpha 16、dropout .05、`q_proj,v_proj`、10 步、batch 1、长度 128 和 CUDA。上限为一张 GPU、30 分钟、8 GiB 持久存储和总计 5 美元，价格须在执行时重新确认。

在同一个固定基础模型、tokenizer、prompt 格式和独立 test 切分上，比较 adapter 前后的 loss、perplexity、样本数和生成样例。记录基础参数冻结、adapter 梯度与更新、reload，以及失败时的检查点和脱敏失败字段。没有测量前不得声称改进。

## 当前观测与局限

现有工件是 CPU 随机权重 smoke 运行，用提示词标为 `-100` 的标签训练，运行只检查基座冻结、adapter 梯度、重新加载与 merge（任一失败即中止）；mask 本身由 `tests/unit/test_lora.py` 和 `tests/unit/test_lora_bos_prompt_mask.py` 测试，不记录在工件中。它不是预训练模型质量、GPU 或云成本证据。没有尝试云端运行，所以 GPU 名称、显存、时间、存储和费用均为 null；不声称改进或回归。授权后应使用英文指南中的公开命令，并在两条命令中固定相同 revision。
