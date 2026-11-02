# dsh-plugin

DeepSeek Harness plugin for showing WorkBuddy credits and the DeepSeek CNY balance side by side, with the credit→CNY conversion derived from measured token usage rather than a guessed exchange rate.

## Install

```sh
dsh plugin --profile desktop add github:ZZZ234234234/dsh-workbuddy-cny
```

Restart DSH afterwards — bundles load at launch.

## Good to know

- Read-only: no check-in, no claiming, no account switching, no credential access.
- Depends on [`dsh-connect-workbuddy`](https://github.com/dingminhua/dsh-connect-workbuddy) for the credit figure; without it only the DeepSeek half renders.
- The conversion rate defaults to a measured midpoint and is overridable in `cordis.patch.yml`.
- Supports DSH `0.2.x`; `tools/measure-rate.mjs` re-derives the rate after upstream pricing changes.

Full documentation: [English](./README.md) · [中文](./README.zh.md)
