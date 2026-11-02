window.__ModuleLoader__.load({
	id: "dsh-workbuddy-cny",
	factory: (require) => {
		const react = require("react");
		const h = react.createElement;
		const { useEffect, useState } = react;

		const STATE_PATH = "/workbuddy-cny/state";

		/** Money formatting: keep the cent, drop float noise. */
		const cny = (value) => {
			if (value === null || value === undefined) return null;
			if (value > 0 && value < 0.01) return "<¥0.01";
			return "¥" + value.toFixed(2);
		};

		const credits = (value) => {
			if (value === null || value === undefined) return null;
			return value.toFixed(2);
		};

		function useState_() {
			const [snapshot, setSnapshot] = useState(null);
			const [error, setError] = useState(null);

			useEffect(() => {
				let alive = true;
				let timer;

				const pull = async () => {
					try {
						const response = await fetch(STATE_PATH, { headers: { accept: "application/json" } });
						if (!response.ok) throw new Error("HTTP " + response.status);
						const doc = await response.json();
						if (!alive) return;
						setSnapshot(doc);
						setError(null);
					} catch (cause) {
						if (!alive) return;
						setError(String(cause && cause.message ? cause.message : cause));
					}
					if (alive) timer = setTimeout(pull, 60000);
				};

				pull();
				return () => {
					alive = false;
					if (timer) clearTimeout(timer);
				};
			}, []);

			return { snapshot, error };
		}

		/**
		 * One line, two purses, and the conversion between them.
		 *
		 * The whole point is that the two numbers are NOT just side by side: the
		 * credit figure carries its CNY equivalent in parentheses, so "is my
		 * WorkBuddy credit worth more than my DeepSeek balance" is answerable
		 * without doing arithmetic in your head.
		 */
		function BalanceLine() {
			const { snapshot, error } = useState_();

			if (error && !snapshot) {
				return h("div", { className: "wbcny-root wbcny-error", title: error }, "—");
			}
			if (!snapshot) {
				return h("div", { className: "wbcny-root" }, "…");
			}

			const creditText = snapshot.credits && snapshot.credits.available ? credits(snapshot.credits.total) : null;
			const creditCny = cny(snapshot.creditsCny);
			const walletCny = cny(snapshot.walletCny);
			const combined = cny(snapshot.combinedCny);

			const tip = [
				snapshot.credits && snapshot.credits.available
					? "WorkBuddy " + creditText + " 积分 × ¥" + snapshot.cnyPerCredit.toFixed(4) + "/积分 = " + creditCny
					: "WorkBuddy: " + (snapshot.credits ? snapshot.credits.reason : "unavailable"),
				snapshot.wallet && snapshot.wallet.available
					? "DeepSeek 余额 ¥" + snapshot.wallet.balance.toFixed(4) + " + 赠送 ¥" + (snapshot.wallet.bonus || 0).toFixed(4)
					: "DeepSeek: " + (snapshot.wallet ? snapshot.wallet.reason : "unavailable"),
				combined ? "合计 " + combined : null,
				"",
				"换算口径：同一批 token 在 DeepSeek 官方按 ¥0.02/¥1/¥4 每百万（命中/未命中/输出，空闲时段）计价，" +
					"与 WorkBuddy 实际扣掉的积分相比 —— 实测空闲 ¥0.0295、高峰 ¥0.0590，本行取中位 ¥" +
					snapshot.cnyPerCredit.toFixed(4) + "/积分。",
				"官方参照：Pro 加量包 US$15 / 500 积分 = US$0.03/积分；国内以人民币计费，对应 ¥" +
					snapshot.officialCnyPerCredit.toFixed(4) + "/积分。",
			]
				.filter((line) => line !== null)
				.join("\n");

			return h(
				"div",
				{ className: "wbcny-root", title: tip },
				h("span", { className: "wbcny-label" }, "WB"),
				creditText
					? h(
							"span",
							{ className: "wbcny-value" },
							creditText,
							creditCny ? h("span", { className: "wbcny-sub" }, " (" + creditCny + ")") : null,
						)
					: h("span", { className: "wbcny-value wbcny-muted" }, "—"),
				h("span", { className: "wbcny-sep" }, "|"),
				h("span", { className: "wbcny-label" }, "DS"),
				walletCny
					? h("span", { className: "wbcny-value" }, walletCny)
					: h("span", { className: "wbcny-value wbcny-muted" }, "—"),
			);
		}

		const CSS = `
.wbcny-root{display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;
  padding:4px 8px;border-radius:8px;color:var(--dsw-alias-label-secondary,#b8bcc4);
  border:1px solid var(--dsw-alias-border-l2,#36373b);background:var(--dsw-alias-bg-layer-3,#202126);
  white-space:nowrap;cursor:default}
.wbcny-label{font-size:10px;font-weight:600;letter-spacing:.02em;opacity:.65}
.wbcny-value{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#e6e6e6)}
.wbcny-sub{opacity:.6;font-size:11px}
.wbcny-sep{opacity:.25}
.wbcny-muted{opacity:.4}
.wbcny-error{color:var(--dsw-alias-state-warn-primary,#f59e0b)}
`;

		const inject = ["slots"];

		function apply(ctx) {
			try {
				if (typeof document !== "undefined" && !document.getElementById("wbcny-style")) {
					const style = document.createElement("style");
					style.id = "wbcny-style";
					style.textContent = CSS;
					document.head.appendChild(style);
				}

				ctx.effect(
					() =>
						ctx.slots.inject("sidebar.footer.action", () =>
							ctx.slots.register(
								{
									name: "sidebar.footer.action",
									id: "workbuddy-cny",
									order: 25,
								},
								BalanceLine,
							),
						),
					"workbuddy-cny: sidebar balance line",
				);
			} catch (cause) {
				console.error("[dsh-workbuddy-cny] failed to mount (provider unaffected):", cause);
			}
		}

		return { apply, inject, name: "dsh-workbuddy-cny" };
	},
});
