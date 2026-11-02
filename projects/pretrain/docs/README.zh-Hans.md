# 本地可恢复小型语言模型预训练与检查点恢复 (Small-Model Pretraining & Resumption)

[English](./README.en.md) | [繁體中文](./README.zh-Hant.md) | [日本語](./README.ja.md)

本项目提供一个可在消费级普通 CPU 上运行的极简生成式 Transformer（nanoGPT 架构）预训练与评估完整闭环。学员可以在本地运行小型预训练、人为中断、并通过原子化检查点恢复训练，同时掌握张量形状台账、内存与算力估算、因果注意力掩码与数据/配置兼容性校验。

---

## 1. 核心目标与前置依赖

### 学习目标
1. **完整预训练闭环**：掌握字符级分词、数据集确定性切分（90% 训练集 / 10% 验证集）、自回归因果预测与交叉熵损失计算。
2. **因果注意力约束**：验证上三角未来掩码保证当前 token 绝不泄露未来位置的信息（前向 logits 不受未来微扰影响，反向梯度为零）。
3. **原子检查点与安全恢复**：掌握基于原子替换（atomic replace）的安全检查点保存机制，即使进程意外中断也不会破坏既有检查点；恢复时完整还原模型权重、AdamW 优化器一阶与二阶矩、全局步数与随机数生成器（RNG）状态。
4. **架构与数据兼容性防护**：在尝试从检查点恢复时，若超参数（如 `n_embd`, `vocab_size`）与保存的状态不符，立即拒绝并报错，绝不静默损坏权重。
5. **算力与资源台账**：通过理论公式精确核算模型参数量、显存/内存占用与训练 FLOPs。

### 运行环境
- Python 3.10+
- PyTorch 2.0+ (`.venv/bin/python`)
- 零 GPU 依赖（可在纯 CPU 上数秒内完成冒烟测试）

---

## 2. 公共命令行接口 (CLI Interface)

本项目提供独立解耦的训练与评估命令行入口，可从任意工作目录调用：

### 2.1 启动小型 CPU 冒烟预训练
```bash
.venv/bin/python projects/pretrain/train.py \
  --smoke \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/smoke_pretrain \
  --max-iters 10
```
- `--smoke`：自动配置轻量级 CPU 冒烟参数（`n_layer=2`, `n_head=2`, `n_embd=16`, `block_size=16`, `batch_size=4`）。
- 运行完毕后，将在 `--work-dir` 生成 `latest.pt`、`step_*.pt` 以及结构化元数据 `run_artifact.json`。

### 2.2 启动标准预训练
```bash
.venv/bin/python projects/pretrain/train.py \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/pretrain \
  --block-size 64 \
  --n-layer 4 \
  --n-head 4 \
  --n-embd 64 \
  --batch-size 32 \
  --max-iters 1000 \
  --eval-interval 200 \
  --checkpoint-interval 200
```

### 2.3 中断后恢复训练 (Resume from Checkpoint)
```bash
.venv/bin/python projects/pretrain/train.py \
  --data-path data/tinyshakespeare.txt \
  --work-dir runs/pretrain \
  --max-iters 2000 \
  --resume auto
```
- `--resume auto`：自动寻找 `--work-dir` 下的 `latest.pt` 检查点并接续训练（如从第 1000 步平滑继续训练至第 2000 步）。
- `--resume <path>`：指定特定检查点路径。

### 2.4 模型评估与文本采样生成
```bash
.venv/bin/python projects/pretrain/evaluate.py \
  --checkpoint runs/smoke_pretrain/latest.pt \
  --data-path data/tinyshakespeare.txt \
  --prompt "ROMEO:" \
  --max-new-tokens 50 \
  --output-json runs/smoke_pretrain/eval_results.json
```
- 计算留出验证集（Val split）交叉熵损失与字符级困惑度（Perplexity）。
- 自回归采样续写文本并打印展示。

---

## 3. 张量形状与参数量台账 (Parameter & Resource Ledger)

### 3.1 理论参数量精确公式

设词表大小 $V$，上下文长度 $T$，隐藏嵌入维度 $C$，注意力头数 $nh$（单头维度 $hs = C / nh$），网络层数 $L$：

| 模块组件 | 计算公式 (bias=False) | 计算公式 (bias=True) | 冒烟配置 ($V=65, T=16, C=16, L=2$) | 标准配置 ($V=65, T=64, C=64, L=4$) |
|---|---|---|---|---|
| **词向量矩阵 (wte)** | $V \times C$ | $V \times C$ | $65 \times 16 = 1,040$ | $65 \times 64 = 4,160$ |
| **位置编码 (wpe)** | $T \times C$ | $T \times C$ | $16 \times 16 = 256$ | $64 \times 64 = 4,096$ |
| **单层自注意力 (Attn)** | $C \times (3C) + C \times C$ | $C \times (3C) + 3C + C \times C + C + 2C$ | $16 \times 48 + 16 \times 16 = 1,024$ | $64 \times 192 + 64 \times 64 = 16,384$ |
| **单层前馈网络 (MLP)** | $C \times (4C) + (4C) \times C$ | $C \times (4C) + 4C + 4C \times C + C + 2C$ | $16 \times 64 + 64 \times 16 = 2,048$ | $64 \times 256 + 256 \times 64 = 32,768$ |
| **全部 $L$ 层合计** | $L \times (\text{Attn} + \text{MLP})$ | 同左 | $2 \times (1,024 + 2,048) = 6,144$ | $4 \times (16,384 + 32,768) = 196,608$ |
| **最终层归一化 (ln_f)** | $0$ (无偏置与缩放) | $2 \times C$ | $0$ | $0$ |
| **输出分类头 (lm_head)** | **与 wte 共享权重 (0 额外参数)** | **与 wte 共享权重** | $0$ (Weight Tied) | $0$ (Weight Tied) |
| **模型总参数量 $N$** | **$\text{wte} + \text{wpe} + \text{Layers} + \text{ln\_f}$** | **同左** | **7,440** | **204,864** |

> **关键设计**：`wte.weight == lm_head.weight`。权重绑定（Weight Tying）直接节省了 $V \times C$ 的独立参数量，不仅减轻内存压力，还利于词向量空间在输入与输出层间保持表征一致性。

### 3.2 内存与算力消耗理论推导

1. **静态模型权重内存**：
   $$\text{Memory}_{\text{weights}} = N \times 4 \text{ bytes (FP32)} \quad (\text{标准配置约 } 0.8 \text{ MB})$$
2. **AdamW 优化器内存**：
   维护一阶矩 $m$ 与二阶矩 $v$：
   $$\text{Memory}_{\text{optim}} = 2 \times N \times 4 \text{ bytes} = 8N \text{ bytes} \quad (\text{标准配置约 } 1.6 \text{ MB})$$
3. **梯度内存**：
   $$\text{Memory}_{\text{grad}} = N \times 4 \text{ bytes} \quad (\text{标准配置约 } 0.8 \text{ MB})$$
4. **单步浮点运算量 (FLOPs)**：
   每个 token 的前向传播约为 $2N$ FLOPs，反向传播约为 $4N$ FLOPs，合计单 token 每次更新消耗 $\approx 6N$ FLOPs。
   每个批次（Batch Size $B$, 序列长度 $T$）单步训练消耗：
   $$\text{FLOPs/step} \approx 6 \times N \times B \times T$$

---

## 4. 原子检查点与恢复机制

在长周期预训练中，机器断电、系统抢占或进程被杀是常见故障。本项目采用两层保护机制：
1. **原子保存（Atomic Save via PID Tempfile & Replace）**：
   - 检查点先写入同目录下的临时文件 `latest.pt.tmp.<pid>`。
   - 写入并同步落盘后，通过操作系统底层的原子文件重命名操作（`os.replace`）将其替换为 `latest.pt`。
   - 若写入过程中遭遇 `SIGKILL`，磁盘上原本的 `latest.pt` 毫发无损，绝对不会产生 0 字节损坏文件。
2. **状态完整性恢复**：
   检查点不仅保存模型参数，还完整保存：
   - 全局步数 `step`
   - 当前损失 `loss`
   - 超参数配置 `config_dict`
   - 数据集词表与数据校验散列 `data_hash`
   - PyTorch CPU/CUDA 与 Python `random` 模块的 RNG 状态
3. **架构与数据兼容性防护**：
   加载检查点时，严格比对当前训练配置与检查点元数据。若发现 `n_embd`、`vocab_size` 或 `block_size` 冲突，立即抛出明确异常中止，杜绝加载错误权重引发静默发散。

---

## 5. 动手实战练习与参考答案

### 练习 1：启动 CPU 冒烟测试并检查运行产物
- **任务**：运行 10 步 CPU 冒烟预训练，检查生成的 `runs/smoke_pretrain/run_artifact.json`。
- **验证**：确认 `completed_steps == 10`，`parameter_ledger.total_parameters == 7440`，且 `train_loss` 呈下降趋势。

### 练习 2：断点恢复实战
- **任务**：
  1. 运行预训练至第 5 步（`--max-iters 5`）。
  2. 模拟进程终止后，重新运行并加入 `--resume auto --max-iters 10`。
- **验证**：观察终端输出确认显示 `Resumed successfully from step 5`，并且第 6 步至第 10 步平滑接续，步数未回滚。

### 练习 3：超参数篡改防御测试
- **任务**：以 `n_embd=16` 保存检查点后，尝试以 `n_embd=32` 和 `--resume auto` 启动恢复。
- **预期反馈**：程序必须立即报错退出，并明确打印出：
  `Resumption rejected due to incompatible configuration: field 'n_embd': expected 32, got 16`
  同时检查磁盘上的原始 `latest.pt` 检查点未受任何更改。

---

## 6. 诚实范围声明 (Truthful Scope Disclaimer)

> **重要学术与工程声明**：  
> 本项目的 CPU 冒烟配置与短步数测试是用于验证**分词机制、张量维度流转、因果自注意力掩码、交叉熵损失下降以及原子检查点恢复机制**的算法与工程正确性。短步数冒烟测试产生的结果**绝不等于收敛的大语言模型，也不能替代真实的多卡 GPU 集群预训练**。
