# npm Package Provenance & Supply-Chain Integrity 实施计划

> **针对智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务实施此计划。步骤使用复选框 (`- [ ]`) 语法进行追踪。

**目标：** 在 GitHub Actions release 工作流中启用 npm 发布 Sigstore 来源证明 (provenance)，完善 monorepo 中所有可发布包的 `repository` 和 `publishConfig.provenance` 元数据，增加发版后 attestation 校验门禁，并评估 OIDC 受信任发布与补充安全验证文档。

**架构：** 在 `.github/workflows/release.yml` 的 Changesets 发布步骤中注入 `NPM_CONFIG_PROVENANCE: "true"` 并在发布后执行 `scripts/verify-provenance.mjs` 校验 `dist.attestations`；在根目录和 `packages/js/*` 7个可发布子包的 `package.json` 中配置精确的 `repository`（含 `directory`）和 `publishConfig.provenance: true`；在 `.github/workflows/wasm-publish.yml` 中补充同样的 post-publish attestation 校验；在 `SECURITY.md` 和 `README.md` 中记录 `npm audit signatures` 验证流程与 npm OIDC 受信任发布决策。

**技术栈：** Node.js, npm CLI >=9.5.0, GitHub Actions (OIDC id-token: write), Changesets CLI, Sigstore / SLSA Provenance.

---

### 任务 1：更新根目录与所有发布包的 package.json 元数据

**文件：**
- 修改：`package.json`
- 修改：`packages/js/analytics/package.json`
- 修改：`packages/js/core/package.json`
- 修改：`packages/js/mood/package.json`
- 修改：`packages/js/react/package.json`
- 修改：`packages/js/social/package.json`
- 修改：`packages/js/stellar/package.json`
- 修改：`packages/js/wasm/package.json`

- [ ] **步骤 1：在 root package.json 中添加 repository 字段**
为 `package.json` 补充 GitHub 仓库地址：
```json
  "repository": {
    "type": "git",
    "url": "https://github.com/Echo-Mirror-Butler/echomirror-sdk.git"
  },
```

- [ ] **步骤 2：在 packages/js/ 7个包中注入 repository (with directory) 与 publishConfig.provenance**
针对以下 7 个包：
- `@echomirror/analytics` (`packages/js/analytics/package.json`)
- `@echomirror/core` (`packages/js/core/package.json`)
- `@echomirror/mood` (`packages/js/mood/package.json`)
- `@echomirror/react` (`packages/js/react/package.json`)
- `@echomirror/social` (`packages/js/social/package.json`)
- `@echomirror/stellar` (`packages/js/stellar/package.json`)
- `@echomirror/wasm` (`packages/js/wasm/package.json`)

确保每个包均包含：
```json
  "repository": {
    "type": "git",
    "url": "https://github.com/Echo-Mirror-Butler/echomirror-sdk.git",
    "directory": "packages/js/<pkg_directory>"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
```

- [ ] **步骤 3：验证各 package.json 的语法完整性与 exports 检查**
运行：`npm run check:exports`
预期输出：所有包通过 publint 与 attw 检查，退出码为 0。

---

### 任务 2：创建发版后来源凭证校验脚本 scripts/verify-provenance.mjs 及自动化测试

**文件：**
- 创建：`scripts/verify-provenance.mjs`
- 创建：`scripts/verify-provenance.test.mjs`

- [ ] **步骤 1：编写脚本单元测试 scripts/verify-provenance.test.mjs**
测试覆盖：
1. 解析 JSON 数组与标准入参；
2. 检测存在 attestations 的包（例如已证明包 `publint@0.3.24` 或 mock）；
3. 检测无 attestations 的包（例如 `@echomirror/core@0.1.0`）时抛出错误或退出；
4. 重试机制逻辑测试。

- [ ] **步骤 2：编写 scripts/verify-provenance.mjs 脚本**
实现独立 CLI 脚本：
- 支持从命令行参数或环境变量 `PUBLISHED_PACKAGES` 读取待校验包列表；
- 兼容 Changesets JSON 格式：`[{"name": "...", "version": "..."}]`；
- 执行 `npm view <pkg>@<version> dist.attestations --json`；
- 内置带延迟的指数退避重试（最多 5 次，每次递增间隔），避免因 npm 注册表副本同步延迟导致误报；
- 若包存在有效的 attestations 判定为通过；若缺少或为空，打印明确错误并 `process.exit(1)`。

- [ ] **步骤 3：运行测试验证 scripts/verify-provenance.mjs 正确性**
运行：`node scripts/verify-provenance.test.mjs`
预期：所有测试通过（Ran X tests ... OK）。

---

### 任务 3：更新 GitHub Actions 发布工作流 release.yml 与 wasm-publish.yml

**文件：**
- 修改：`.github/workflows/release.yml`
- 修改：`.github/workflows/wasm-publish.yml`

- [ ] **步骤 1：在 .github/workflows/release.yml 中配置 NPM_CONFIG_PROVENANCE 及后置校验**
1. 在 Changesets action 步骤添加 `id: changeset`；
2. 在 Changesets action `env` 中添加 `NPM_CONFIG_PROVENANCE: "true"`；
3. 添加后续步骤：
```yaml
      - name: Verify package provenance attestations
        if: steps.changeset.outputs.published == 'true'
        env:
          PUBLISHED_PACKAGES: ${{ steps.changeset.outputs.publishedPackages }}
        run: node scripts/verify-provenance.mjs "$PUBLISHED_PACKAGES"
```

- [ ] **步骤 2：在 .github/workflows/wasm-publish.yml 中添加 post-publish 校验**
在 publish step 之后添加校验步骤：
```yaml
      - name: Verify package provenance attestations
        run: |
          pkg_version=$(node -p "require('./packages/js/wasm/package.json').version")
          node scripts/verify-provenance.mjs "[{\"name\":\"@echomirror/wasm\",\"version\":\"$pkg_version\"}]"
```

- [ ] **步骤 3：验证 YAML 语法完整性**
使用 Node.js / yaml 工具解析 release.yml 和 wasm-publish.yml 确保无缩进或语法错误。

---

### 任务 4：补充安全验证与 OIDC 受信任发布评估文档 (SECURITY.md & README.md)

**文件：**
- 修改：`SECURITY.md`
- 修改：`README.md`

- [ ] **步骤 1：在 SECURITY.md 中新增“Package Provenance & Supply-Chain Integrity”章节**
详细记录：
1. **npm Provenance**: 详细说明基于 Sigstore 和 GitHub Actions OIDC 的 SLSA 来源证明机制；
2. **验证方式**: 用户如何通过 `npm audit signatures` 验证已安装依赖的数字签名与来源凭证，以及如何通过 `npm view <pkg> dist.attestations` 查询单个包；
3. **OIDC 受信任发布评估与决策 (Evaluation of npm Trusted Publishing)**:
   - 分析 npm OIDC Trusted Publishing 相较长效 `NPM_TOKEN` 的优势；
   - 说明当前 monorepo 环境下 Changesets 发布机制与 npm 平台逐包注册要求的约束；
   - 记录阶段性决策：现阶段在 CI 中保留 `NPM_TOKEN` 同时开启 Sigstore 来源凭证生成，后续管理员在 npmjs.com 配置每个包的受信任发布规则后无缝迁移至完全无密钥发布；
   - 提供管理员在 npmjs.com 后台配置受信任发布的完整步骤指导。

- [ ] **步骤 2：在 README.md 中新增“Verifying Package Provenance”说明**
指导开发者和集成商如何使用 `npm audit signatures` 验证 EchoMirror 发布的 NPM 包。

---

### 任务 5：全量回归验证与代码质量检查

**文件：**
- 测试命令：`npm run check:exports`, `cargo test`, `node scripts/verify-provenance.test.mjs`

- [ ] **步骤 1：执行 check:exports 校验所有子包规范**
运行：`npm run check:exports`
预期：全部通过。

- [ ] **步骤 2：执行 native cargo test**
运行：`cargo test`
预期：所有 Rust 原生测试通过。

- [ ] **步骤 3：执行 provenance 校验套件测试**
运行：`node scripts/verify-provenance.test.mjs`
预期：所有用例通过。

- [ ] **步骤 4：检查 Git 变更与排除列表**
检查 `git status` 与 `git diff`，确保符合零冗余垃圾文件标准。
