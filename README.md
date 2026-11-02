# dsh-workbuddy-cny

[![DSH plugin](https://img.shields.io/badge/DSH-plugin-4b8bf5)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js >= 22.19](https://img.shields.io/badge/node-%E2%89%A522.19-3c873a)](./package.json)

English | [中文](./README.zh.md)

Put both purses on one line in the DeepSeek Harness sidebar — and convert between them:

```
WB 2,025.94 (¥89.14)  |  DS ¥11.22
```

Hover for the full breakdown: the conversion rate, the DeepSeek recharge/bonus split, and what the two add up to.

## Why

In DSH you typically run two balances side by side:

- **WorkBuddy / CodeBuddy credits** — spent through the desktop app's own pool (via [`dsh-connect-workbuddy`](https://github.com/dingminhua/dsh-connect-workbuddy))
- **DeepSeek official balance** — billed per token in CNY

The two are in different units, so putting them next to each other answers nothing. To know whether your credit pile is worth more than your wallet — or what both together are worth — the credits have to be priced in yuan first.

Existing plugins show either raw credits or a CNY balance. None of them do the conversion.

## How the rate is derived (not guessed)

**Step 1 — measure what the credits bought.** Read the tokens every `workbuddy` turn actually consumed from DSH's own session logs (`inputTokens` / `cacheReadTokens` / `outputTokens`), and read the credit balance before and after the measurement window.

**Step 2 — price those same tokens at DeepSeek's official rate.** DeepSeek publishes CNY prices per 1M tokens for `deepseek-flash`:

| | Cache hit | Cache miss | Output |
|---|---|---|---|
| Off-peak | ¥0.02 | ¥1 | ¥4 |
| Peak | ¥0.04 | ¥2 | ¥8 |

Divide what those tokens would have cost on DeepSeek by the credits they actually consumed.

**Measured on the author's machine:**

| Window | ¥ per credit |
|---|---|
| Off-peak | 0.0295 |
| Peak | 0.0590 |
| **Midpoint (default)** | **0.0440** |

**Cross-check against list price.** WorkBuddy Pro's add-on pack is US$15 / 500 credits = US$0.03/credit. The domestic product bills in CNY, which reads as ¥0.03/credit — the same order of magnitude as the measured value. Both numbers live in the tooltip so you can compare them.

> Why not just use list price: list price is what you pay to *buy* credits, while the measured value is what the *work* those credits bought would cost on DeepSeek. They answer different questions, and the former moves with promotions. The measured value is the default; both are configurable.

## Install

Requires DSH `0.2.x` and a working `dsh-connect-workbuddy` install (for the credit half).

```sh
dsh plugin --profile desktop add github:ZZZ234234234/dsh-workbuddy-cny
```

Then **restart DSH** — bundles load at launch.

### Desktop profile caveat

The `desktop` profile is owned by the Electron app: the CLI writes the dependency, but only a restart confirms the bundle actually composed. If the line does not appear, check that `dsh-workbuddy-cny` is in the profile's `dsh.profile.bundles` and that the entry did not fail config validation (activation errors only reach stderr, never the UI).

## Configure

Override in the profile's `cordis.patch.yml`:

```yaml
- id: workbuddy-cny
  name: dsh-workbuddy-cny
  config:
    cnyPerCredit: 0.044          # measured midpoint
    officialCnyPerCredit: 0.03   # vendor list-price reference
    region: cn
```

On a Team seat (US$0.02/credit) or during a promotion, change these two numbers. No code change needed.

## Re-calibrate after a price change

`tools/measure-rate.mjs` reproduces the measurement:

```sh
node tools/measure-rate.mjs "<path-to-session.v4.jsonl.zstd>" <dsh-port>
```

It prints the token totals, what those tokens cost on DeepSeek at both windows, and the implied ¥/credit. Session logs live under `~/.dsh/sessions/<workspace>/session-<id>/session.v4.jsonl.zstd`.

## Where the data comes from

| Data | Source |
|---|---|
| WorkBuddy credits | `dsh-connect-workbuddy`'s same-origin route `/plugins/dsh-connect-workbuddy/usage` |
| DeepSeek balance | `ctx.deepseekAccount.getBalance()` — the same endpoint the account settings page uses |
| Token counts | Used only to derive the rate; not read at runtime |

The plugin is **read-only**: no check-in, no claiming, no account switching, no credential access. Both figures are a snapshot of the same instant, and a failed read renders as `—`, never as `0`.

## Known limits

- **Needs `dsh-connect-workbuddy`** — without it the WorkBuddy half shows `—` and the DeepSeek half still works.
- **DeepSeek not signed in** — wallet shows `—`, not ¥0.00.
- **Rate is not live** — re-run the measurement after upstream price changes.
- Refreshes once a minute, matching the account page.

## License

MIT
