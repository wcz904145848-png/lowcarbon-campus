---
type: task-card
id: T-001
status: open
contractVersion: 0.2.0
created: 2026-10-18
revised: 2026-10-18
owner: design
deliverable: Collab/40_Handoff/from-gpt/T-001-answer.md
---

# T-001（v2）把已有设计收敛成可实现的 3 分钟演示

> **原 T-001 作废。** 原版让设计端"从三个候选循环里挑一个"——前提是错的：你已经有《游戏设想》和《玩法与介绍》两份文档，玩法不是待创造，而是待**收敛成数据**。
>
> 契约已升到 **0.2.0**（破坏性变更），照你的双账户 + 因子核算重构。原版让填的 `carbonSaving` 常数已被删除。

## 背景

工程端仍然没有 Unity 工程，但盘上已有：

- `Collab/10_GDD/source/游戏设想.docx` —— 双账户架构、三类互动、商业化与理论依据
- `Collab/10_GDD/source/玩法与介绍.pptx` —— 12 页，含核算公式、用户旅程、信息架构
- `Collab/30_Art/画风参考图.jpg` —— 10 个手机竖屏界面
- `Collab/30_Art/UI元素参考图.png` —— 等距像素素材表（建筑/地形/植物五阶段/人物/图标）
- `Collab/30_Art/ui-baseline.md` —— 我对这些图的工程读法
- `Collab/10_GDD/design-notes.md` —— 两份文档的要点摘录（可直接读，不必解 docx）

契约 v0.2.0 已冻结：**双账户**、**估算减排量 = 数量 ×（基准因子 − 实际因子）**、**防重复申报**、**估算值措辞**。

## 我要你产出什么（按顺序）

### 1. 3 分钟演示脚本（最重要的一节）

以「一个评委站在旁边看你玩 3 分钟」为准。逐段写：

| 时间 | 玩家看到什么 | 玩家做什么 | 屏幕上哪个数字在变 |
|---|---|---|---|

硬要求：

- 从打开到看到结果，**不留空白**、不出现「这里还没做完」
- 至少出现**一次「计算情景」面板**（基准 / 数量 / 因子 / 替代 / 结果 / 来源）
- 至少出现**一次植物阶段跃迁**（让"低碳 → 长树"的因果在 3 分钟内闭合）
- 结尾必须有一句能被评委记住的话

### 2. 因子表 `FactorDef`（8–12 条）

| id | displayName | unitKind | factorKgPerUnit | source | isDemoAssumption |
|---|---|---|---|---|---|

要求：`id` lowerCamelCase；每条的 `source` 要能写出来（哪怕是"演示假设"）；演示假设必须标 `true`。

### 3. 任务表 `ActionDef`（12–16 条）

| id | title | desc | category | quantityKind | defaultQuantity | baselineFactorId | actualFactorId | cost | difficulty | unlockAt |
|---|---|---|---|---|---|---|---|---|---|---|

注意**表里没有减排量列**——减排是算出来的。请自查：每条引用到的 factorId 都在第 2 节里存在。

覆盖面按《玩法与介绍》P3：教学楼/图书馆（步行、骑行、无纸化）、宿舍/生活区（节电、节水、循环）、食堂/商业区（自带杯、少一次性）。三类场景都要有，否则演示只看到一半。

### 4. 一个关卡 `LevelDef`

`id` / `title` / `goalCarbon` / `dayLimit` / `allowedActionIds`，并附算术：

```
满勤一天最多能记 ___ 条，单条均值 ___ kg
dayLimit 天内理论上限 = ___ kg
目标占比 = goalCarbon / 理论上限 = ___%   （建议 50–70%）
```

### 5. 植物表 `PlantDef`（4–6 种）

`id` / `displayName` / `stageNames`(5) / `stageThresholds`(4，递增) / `season` / `rarity` / `seedSource`

参考图给了 樱花 / 银杏 / 桂花 / 水杉，五个阶段是 种子 / 幼苗 / 小树 / 成树 / 盛放。

**门槛要和数值对齐**：演示 3 分钟能攒多少成长点？第一株植物必须在这 3 分钟内至少跨过一个阶段，否则"养成"在演示里不存在。

### 6. 双账户的 HUD 呈现

只描述**信息层级和位置关系**（平台未定，不要给像素）：

- `carbonTotal` 和 `growthPoints` 分别放在哪、多大、什么视觉权重
- 怎么让玩家不会把两个数加在一起（这是契约 `ui.hud.rule` 的硬要求）

### 7. 三类互动的最小形态

盲盒 / 交换 / 共建，每个给：一句话规则 + 单机模拟需要什么数据 + **我需要在 3 分钟里演示它吗**。允许你回答"这个不演示，只在结算页出现"。

### 8. 砍留清单

明确列出：**必做 / 可选 / 砍掉**，并说明砍掉的理由。不要三个都留——3 分钟装不下 10 个界面。

## 约束

- 不写 C#。不新增场景（只有 `Boot` / `MainMenu` / `Game` / `Result`）。
- **平台未定**：所有布局用相对描述（"底部 12% 区域"），不许给绝对像素。
- 契约里已冻结的字段名照抄。要新增字段 → 在 answer 末尾写「契约变更提案」。
- 三类互动如果判定要砍，直接说砍——我要的是判断，不是平衡。

## 验收标准

- [ ] 第 2/3/4/5 节能直接生成 4 个 JSON：`factors.json` / `actions.json` / `levels.json` / `plants.json`
- [ ] 我的校验跑得过：required 齐、类型对、枚举合法、所有引用的 factorId / actionId 都存在
- [ ] 第 1 节的脚本我能一段段照着实现，不需要回问
- [ ] 第 5 节的门槛在 3 分钟内可达（我要验算这个）

---

## 交付方式（Codex 直接照做）

1. 完整回答写进 `Collab/40_Handoff/from-gpt/T-001-answer.md`
2. 四张表同时落成 `Assets/GameData/{factors,actions,levels,plants}.json`
3. 把本卡 front-matter 的 `status: open` 改成 `status: done`
4. 停手
