# 真实开源模型 LoRA 项目

Ticket 21 的证据包（授权门禁、权利、上限、未测量值 null、四语言报告）位于 [`../evidence/`](../evidence/)。当前没有云端运行，仍等待授权。

本项目提供两种明确区分的运行模式。`--smoke` 在本地构建随机权重的小型 Transformer，以确定性的 CPU LoRA 训练、保存并重新加载适配器，不会下载任何内容；它只验证机制。真实模式使用 Hugging Face 因果语言模型与 PEFT。示例模型为 `openai-community/gpt2`（模型卡：https://huggingface.co/openai-community/gpt2，发布方声明 MIT 许可）。运行前请检查最新模型卡及访问条款。随附指令示例是原创合成练习数据，并非基准，不可据此宣称质量提升。

## 环境

需要 Python 3.10+、PyTorch 2.2+、Transformers 4.46.3、PEFT 0.13.2。冒烟模式沿用仓库现有 PyTorch 环境；只有真实模型运行才安装 `projects/lora/requirements.txt`。GPU 可选。示例模型下载数百 MB，需要网络；CPU 训练可能较慢。命令不需要云服务商、付费 GPU 或外部变更，也未获准进行这些操作。模型下载会占用本地存储。使用 `--local-files-only` 可强制只用缓存模型。

## 重现本地冒烟测试

```bash
.venv/bin/python projects/lora/train.py --smoke \
  --data-path data/instruction_sample.jsonl --work-dir runs/lora-smoke \
  --seed 42 --max-iters 4 --max-length 96
.venv/bin/python projects/lora/evaluate.py \
  --adapter-dir runs/lora-smoke --data-path data/instruction_sample.jsonl \
  --output-json runs/lora-smoke/eval_results.json
```

预期文件包括 `adapter_model.pt`、`adapter_config.json`、`base_model.pt`、`tokenizer.json`、`run_artifact.json` 和 `telemetry.jsonl`（每个优化步一行 JSON：`step`、`train_loss`、`lr`、`elapsed_seconds`、`mode`；可用 `tail -f` 跟踪运行中的训练；`--resume` 会追加）。元数据标记 `smoke: true`、零下载、随机本地基座，并要求 `adapter_round_trip_verified: true`。评估报告留出集损失/困惑度和生成样例；微小结果不代表模型质量。

## 训练真实开放模型适配器

先检查模型卡及可用磁盘、内存和显存。每次运行使用新的输出目录。

```bash
.venv/bin/python -m pip install -r projects/lora/requirements.txt
.venv/bin/python projects/lora/train.py \
  --model openai-community/gpt2 --revision <已审阅的提交哈希> \
  --data-path data/instruction_sample.jsonl --work-dir runs/gpt2-lora \
  --device cpu --max-iters 10 --batch-size 1 --max-length 128 --seed 42
.venv/bin/python projects/lora/evaluate.py \
  --adapter-dir runs/gpt2-lora --data-path data/instruction_sample.jsonl \
  --model openai-community/gpt2 --revision <相同的已审阅提交哈希> \
  --device cpu --output-json runs/gpt2-lora/eval_results.json
```

将占位符换成已检查的修订版本；省略 `--revision` 虽可运行，但模型来源会变化。`--local-files-only` 禁止提供方下载。训练会冻结基座，仅训练 PEFT 适配器；运行元数据记录模型/修订版、数据哈希、切分数量、随机种子、秩/缩放、参数台账、损失和下载策略。评估会重新加载适配器，并在确定性的独立测试集上比较基座与适配模型损失。少于十条记录时可能没有测试集，评估会失败，而不会泄漏验证或训练数据。结果可能变差，应如实报告。真实训练尚不支持恢复；该模式使用 `--resume` 会被拒绝。失败后请使用新的工作目录。

## 数学与参数核算

冻结基座矩阵 $W_0 \in \mathbb{R}^{d_{out}\times d_{in}}$，LoRA 学习 $A \in \mathbb{R}^{r\times d_{in}}$ 与 $B \in \mathbb{R}^{d_{out}\times r}$：

$$W = W_0 + (\alpha/r)BA.$$

每个目标线性层新增 $r(d_{in}+d_{out})$ 个适配器参数，而不是训练 $d_{out}d_{in}$ 个参数。GPT-2 的注意力投影名称可能不同于含 `q_proj`/`v_proj` 的架构；检查模型模块，必要时用 `--target-modules` 指定。参数台账提供实际数量；优化器状态和激活仍占内存，因此适配器参数数目不等于运行总内存。

批次中的 `input_ids`、`attention_mask`、`labels` 形状为 `[batch, sequence]`。提示词对应的标签设为 `-100`，因果语言模型损失只训练回答 token。确定性切分复用文本/数据项目的逻辑，并用记录哈希与种子标识。

## 练习与反馈

1. 用相同种子运行两次冒烟训练，比较元数据中的数据哈希、指标和适配器往返校验。时间戳及序列化元数据可能不同；同一 PyTorch 环境下预测与指标应一致。冒烟模式不会访问 Transformers、PEFT 或网络。
2. 计算输入宽 768、输出宽 2304、秩 8 的线性层适配器参数数：$8(768+2304)=24,576$。与基座矩阵的 $768\cdot2304=1,769,472$ 参数比较，比例约 1.39%；不包括偏置和模型其他层。
3. 检查一个分词样本的标签：所有提示位置必须为 `-100`，且至少保留一个回答 token。若截断移除了整个回答，增大 `--max-length`。
4. 对照评估的 `held_out_samples`、`data_hash` 与切分数量。缺少测试集是错误，不代表可以复用训练样本。
5. 不挑选样例解释失败或损失变差：检查基线、数据量、目标模块、优化步数和独立评估。没有规定必须提升。

答案：练习 1-2 按照上述可重复性要求及矩阵维度公式核验。练习 3 中提示标签被屏蔽，回答标签为 token ID；回答标签为零时会触发明确验证错误。练习 4 使用至少十条不同记录及默认 80/10/10 切分。练习 5 报告观测值与限制；不能只凭生成样例宣称成功。

验收边界：测试通过确定性的本地数据执行公开命令。测试不证明远程模型已下载、许可适用于所有用途、特定设备可负担训练，或微调必然提升效果。未获单独授权不得使用付费算力。
