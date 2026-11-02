# Claude Code 智能体工具路线

**路线状态：** 课程内容已完成；真实工具验收**因等待授权而阻塞**。
**验证日期：** 2026-10-30（仅审查了文档和确定性 fixture；未发起任何付费请求）。
**观察到的工具版本：** `claude 2.1.312`（`claude --version`）。不要根据 CLI 版本推断模型或提供方。

## 官方资料与访问

使用 [Claude Code overview](https://docs.claude.com/en/docs/claude-code/overview)、[setup](https://docs.claude.com/en/docs/claude-code/setup)、[permissions](https://docs.claude.com/en/docs/claude-code/permissions)、[settings](https://docs.claude.com/en/docs/claude-code/settings) 和 [costs](https://docs.claude.com/en/docs/claude-code/costs) 页面。CLI、参数、模型和价格都会变化，真实运行前请再次核对。

学习者需要一个已授权的 Anthropic 账号，以及已批准的 Claude Code 登录／订阅途径，或一个有可用额度的 Anthropic API 密钥。课程不提供凭据。真实运行可能产生计费的 API 用量；**未经学习者明确授权，不要登录、添加付款方式或花钱。** 提供方是 Anthropic。模型由已授权的账号／配置决定，本练习不假定固定模型。请记录真实运行当天使用的模型名称和价格页面。`ANTHROPIC_API_KEY` 绝不能提交到仓库，也不能写进提示词。

## 可复现的安装与受限配置

```sh
# 在一次性 clone／worktree 中，获得授权后运行：
claude --version                 # 记录观察到的版本
claude login                     # 或使用已授权的账号
claude                           # 从 fixture 目录启动
```

接受工具操作之前，先检查权限提示。从当前版本提供的最小权限开始；使用文档中的 permissions／settings 机制，不要复制未经审查的配置。拒绝网络、部署、凭据、破坏性以及 worktree 之外的操作。设置较短的会话期限、最多两轮修正，以及学习者批准的费用上限。可用时使用 `/cost`，并在不含机密的前提下记录显示的提供方／模型／费用。具体的权限参数和设置名称随版本变化：请以上面链接的官方 permissions／settings 页面为准，并记录实际选择的内容。

## 一次性练习

把 `projects/claude-code-disposable/` 复制到临时目录或 worktree。只给智能体提供简短的缺陷报告、`src/greeter.py` 和 `tests/test_greeter.py`，并要求它只修改 `src/greeter.py`。fixture 中有一个故意失败的测试：智能体必须先观察到失败，做最小的修改，运行测试并报告退出码。然后学习者独立运行测试，审查 `git diff --check` 和 `git diff`，并拒绝 `src/greeter.py` 以外的任何文件改动。第二轮提示必须纠正一个故意错误的首次结果（期望的问候语区分大小写）；失败结果和纠正后的结果都要记录。

必需的本地证据命令：

```sh
cd projects/claude-code-disposable
python3 verify_fixture.py
```

公开的验证脚本会创建一个临时 Git 仓库，记录故意失败的测试，只应用受限的首字母大写修正，重新运行测试，并检查 `git diff --check` 和改动路径列表。如果真的运行了 Claude Code，请在工具退出后自己执行同样的命令；验证脚本只是确定性的替代品。

第一条命令是**确定性替代品**，不能证明 Claude Code 运行过。它在无法获得授权时有用。`docs/evidence/claude-code/` 中经过脱敏的产物只是文档／fixture 证据，不得当作真实工具的记录展示。只有当学习者提交脱敏后的记录或命令日志，显示真实的 Claude Code 版本、所选提供方／模型、权限决定、费用（或套餐／额度）、失败、修正、独立测试输出和已审查的差异时，真实运行才会被验收。绝不要包含 API 密钥、账号标识、含机密的提示内容或外部副作用。

## 验收标准

- [ ] 已在运行当天核对安装步骤和官方资料链接。
- [ ] 已记录版本、提供方、模型、访问途径、费用／套餐假设和授权情况。
- [ ] 上下文最小，权限受限，项目是一次性的。
- [ ] 已逐行审查真实智能体的改动，且改动仅限于指定文件。
- [ ] 学习者运行的测试带退出码，展示了故意的失败和修正后的成功。
- [ ] 脱敏后的真实运行证据与本 fixture 和文档审查分开存放。

**当前限制：** 本环境可以观察到 `claude 2.1.312`，但没有提供已授权的 Anthropic 账号／API 密钥。没有发起任何付费或外部的 Claude Code 调用，因此真实运行这一项保持阻塞，而不是用模拟填补。
