# dsh-workbuddy-cny

[![DSH plugin](https://img.shields.io/badge/DSH-plugin-4b8bf5)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js >= 22.19](https://img.shields.io/badge/node-%E2%89%A522.19-3c873a)](./package.json)

[English](./README.md) | 中文

> [!WARNING]
> **默认换算率已知偏低（大约只有真值的一半）。** 它是在 WorkBuddy 桌面端同时后台消耗积分的机器上标定的，分母被污染了。证据与修正进展见 [#1](https://github.com/ZZZ234234234/dsh-workbuddy-cny/issues/1)。
>
> 插件本身不受影响 —— 有问题的只是标定数字。如果你现在就需要一个准确的数，请自行在 `cordis.patch.yml` 里设置 `cnyPerCredit`，或退出 WorkBuddy 桌面端后用 `tools/measure-rate.mjs` 在干净窗口上重测。

把两种余额放在 DeepSeek Harness 侧栏的同一行里 —— 并在它们之间做换算：

```
WB 2,025.94 (¥89.14)  |  DS ¥11.22
```

鼠标悬停可看完整拆解：换算率、DeepSeek 充值/赠送余额的拆分，以及两边合计。

## 为什么需要它

在 DSH 里通常同时挂着两套余额：

- **WorkBuddy / CodeBuddy 积分** —— 走桌面端自己的积分池（经 [`dsh-connect-workbuddy`](https://github.com/dingminhua/dsh-connect-workbuddy)）
- **DeepSeek 官方余额** —— 按 token 以人民币计费

两者单位不同，并排放着回答不了任何问题。要判断「我这堆积分是不是比余额值钱」，或者「两边加起来还剩多少」，得先把积分折成人民币。

现有插件要么显示原始积分，要么显示人民币余额，都不做换算。

## 换算率怎么来的（不是猜的）

**第一步 —— 量出积分买到了什么。** 从 DSH 自己的会话日志里读出每个 `workbuddy` 回合真实消耗的 token（`inputTokens` / `cacheReadTokens` / `outputTokens`），再读测量窗口前后的积分余额差额。

**第二步 —— 用 DeepSeek 官方价给同一批 token 定价。** DeepSeek 公布的 `deepseek-flash` 人民币价（每百万 token）：

| | 缓存命中 | 缓存未命中 | 输出 |
|---|---|---|---|
| 空闲时段 | ¥0.02 | ¥1 | ¥4 |
| 高峰时段 | ¥0.04 | ¥2 | ¥8 |

用这个价算出同一批 token 在 DeepSeek 上要花多少钱，除以它们实际扣掉的积分。

**作者本机实测：**

| 口径 | ¥/积分 |
|---|---|
| 空闲时段 | 0.0295 |
| 高峰时段 | 0.0590 |
| **中位（默认值）** | **0.0440** |

**用列表价交叉验证。** WorkBuddy Pro 加量包是 US$15 / 500 积分 = US$0.03/积分。国内版以人民币计费，可读作 ¥0.03/积分 —— 与实测值同一量级。两个数都放在 tooltip 里，方便对照。

> 为什么不直接用列表价：列表价是「买积分」的价格，而实测值反映的是「这些积分换来的算力在 DeepSeek 上值多少钱」。两者回答的是不同问题，且前者会随促销变化。默认用实测值，两者都可配置。

## 安装

需要 DSH `0.2.x`，以及可用的 `dsh-connect-workbuddy`（积分那一半依赖它）。

```sh
dsh plugin --profile desktop add github:ZZZ234234234/dsh-workbuddy-cny
```

然后 **重启 DSH** —— bundle 在启动时加载。

### desktop profile 的注意事项

`desktop` profile 由 Electron 应用独占：CLI 只写入依赖，但只有重启才能确认 bundle 真的进入了组合。如果那一行没出现，请检查 profile 的 `dsh.profile.bundles` 里有 `dsh-workbuddy-cny`，并确认该 entry 没有在配置校验中失败（激活错误只进 stderr，界面上不会有任何提示）。

## 配置

在 profile 的 `cordis.patch.yml` 中覆盖：

```yaml
- id: workbuddy-cny
  name: dsh-workbuddy-cny
  config:
    cnyPerCredit: 0.044          # 实测中位数
    officialCnyPerCredit: 0.03   # 官方列表价参照
    region: cn
```

如果是 Team 坐席（US$0.02/积分）或遇到促销，改这两个数即可，不用动代码。

## 调价后重新标定

`tools/measure-rate.mjs` 可复现整个测量：

```sh
node tools/measure-rate.mjs "<session.v4.jsonl.zstd 的路径>" <dsh 端口>
```

它会打印 token 合计、这些 token 在 DeepSeek 两种时段下的花费，以及推导出的 ¥/积分。会话日志位于 `~/.dsh/sessions/<workspace>/session-<id>/session.v4.jsonl.zstd`。

## 数据来源

| 数据 | 来源 |
|---|---|
| WorkBuddy 积分 | `dsh-connect-workbuddy` 的同源路由 `/plugins/dsh-connect-workbuddy/usage` |
| DeepSeek 余额 | `ctx.deepseekAccount.getBalance()` —— 与账户设置页同一个接口 |
| token 用量 | 仅用于推导换算率，运行时不读 |

插件是**只读**的：不签到、不领奖、不切账号、不碰凭据。两个数字是同一时刻的快照，读取失败时显示 `—`，绝不显示成 `0`。

## 已知边界

- **依赖 `dsh-connect-workbuddy`** —— 未安装时 WorkBuddy 一栏显示 `—`，DeepSeek 一栏照常。
- **DeepSeek 未登录** —— 余额显示 `—`，不是 ¥0.00。
- **换算率不是实时的** —— 上游调价后需重新标定。
- 每分钟刷新一次，与账户页一致。

## 许可证

MIT
