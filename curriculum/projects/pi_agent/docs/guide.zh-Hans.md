# Pi Agent Tool Track（简体中文）

本路线使用 Pi 完成共享的 Agent 协同工程检查。Pi 是可扩展的 agent harness，不是模型提供商。官方资料与 `v1.4.0`（2026-10-30）已核对：https://github.com/earendil-works/pi/releases/tag/v1.4.0。运行时需要 Node.js `>=22.19`。

## 安装、访问与成本

```sh
curl -fsSL https://pi.dev/install.sh | sh
# 或按官方 README 固定版本
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0
pi --version
```

在隔离项目中运行 `pi`，用 `/login` 或官方 provider 配置接入已获批准的 provider/model。教学记录必须写入 `provider`、`model`、`model_version`、日期和预算；本仓库不含密钥，也没有声称进行过 live provider 运行。Pi 本身不收模型费用；API token、订阅额度、本地电费或托管推理费用由 provider 收取。付费访问和购买必须逐项获得授权。

## 原生能力与扩展

v1.4.0 原生包含交互、print/JSON、会话与上下文管理、压缩/分支、模型选择，以及文件读写、grep、find、bash 工作流。官方 README 明确说明 Pi 不自带 sub-agent delegation 和 plan mode；不能把它们写成原生能力。extensions、skills、prompt templates、themes、packages、MCP 和 SDK 是扩展边界，安装第三方代码前必须审计并获准。

## 练习与权限边界

使用 `curriculum/projects/pi_agent/fixture`：先只提供失败测试、相关函数和验收标准，限制写入隔离目录，拒绝网络、部署、凭据和安装请求。每次写入后检查 `git status`、`git diff --check`，并由学习者亲自运行 `python3 -m unittest discover -s tests`。练习包含 secret、删除断言、webhook 和无关依赖修改；必须拒绝并恢复，再独立重跑测试。证据为脱敏 `run-record.json`、真实退出码、diff 和根因说明；模拟 transcript 只能标为 simulation，不能冒充 live 证据。

## 故障、答案与验收

命令找不到时检查 Node/PATH；登录失败时检查 provider、model、区域和额度，不要打印密钥；上下文过大时删去无关文件；意外修改时先停止并保存 diff；重复失败时记录命令和退出码，每次只改一处。参考答案必须识别泄露密钥、删除测试、外发 webhook 和依赖漂移，恢复隔离项目并独立运行测试。“Pi 说测试通过”不是证据。Agent 协同检查要求上下文、权限、成本、diff、测试、故障修正和证据全部可追溯；无 provider 访问应标记为 blocked。独立掌握检查必须不使用 Pi。安装扩展、付费请求、外发消息、部署和隔离目录外的变更都需要单独授权。
