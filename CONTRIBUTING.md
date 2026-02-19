# Contributing to OpenPollen

感谢你对 OpenPollen 的贡献兴趣！

## 开发环境

```bash
git clone https://github.com/tom-byte-sys/OpenPollen.git
cd OpenPollen
npm install
npm run dev
```

## 提交 Pull Request

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feat/my-feature`)
3. 提交修改 (`git commit -m 'feat: add my feature'`)
4. 推送到你的 Fork (`git push origin feat/my-feature`)
5. 创建 Pull Request

### Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `test:` 测试
- `chore:` 杂项

### 代码质量

提交前确保通过：

```bash
npm run typecheck    # TypeScript 类型检查
npm run test         # 运行测试
```

## 报告问题

- 使用 [GitHub Issues](https://github.com/user/OpenPollen/issues) 报告 Bug
- 提供复现步骤、期望行为、实际行为
- 附上 Node.js 版本和操作系统信息

## 功能请求

通过 Issue 描述你的需求，说明使用场景和期望效果。

## 技能开发

OpenPollen 使用 SKILL.md 标准。参考 `skills/` 目录中的内置技能开发新技能。

## 许可证

贡献的代码将遵循 [Apache 2.0](LICENSE) 许可证。
