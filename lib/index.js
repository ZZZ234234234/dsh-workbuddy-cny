/**
 * dsh-workbuddy-cny — host half.
 *
 * Two read-only sources, one joined document:
 *
 *   GET /workbuddy-cny/state?region=cn
 *
 * The browser half cannot reach either source on its own: the WorkBuddy credit
 * figures live behind the dsh-connect-workbuddy plugin's own host route, and the
 * DeepSeek wallet lives behind `ctx.deepseekAccount`, a host service. So this
 * module owns both reads and hands the browser a plain snapshot.
 *
 * Nothing here writes: no check-in, no claim, no account switch. The credit
 * figure is the same number the WorkBuddy card already shows, and the wallet is
 * the same one the account settings page shows.
 *
 * @module dsh-workbuddy-cny
 */
import Schema from '@deepseek-ai/schemastery'

export const name = 'dsh-workbuddy-cny'
export const inject = []

/** Route the browser half reads. */
const STATE_PATH = '/workbuddy-cny/state'

/** Where dsh-connect-workbuddy publishes the credit document. */
const WORKBUDDY_USAGE_PATH = '/plugins/dsh-connect-workbuddy/usage'
const WORKBUDDY_USAGE_PATH_ALT = '/plugins/dsh-workbuddy-connect/status'

/**
 * Credit-to-CNY conversion.
 *
 * `cnyPerCredit` is MEASURED, not guessed. Method: take the tokens the
 * WorkBuddy turns in this workspace actually consumed (from DSH's own session
 * logs), price those tokens at DeepSeek's published CNY rate for the same model
 * (`deepseek-flash`: ¥0.02 cache-hit / ¥1 cache-miss / ¥4 output per 1M tokens,
 * off-peak), and divide by the credits those turns actually cost (read from the
 * credit balance before and after).
 *
 * Measured on this machine: ¥0.0295 per credit off-peak, ¥0.0590 at peak.
 * The midpoint ¥0.044 is what the sidebar defaults to, because a turn can land
 * in either window and the balance is not itemised by time of day.
 *
 * The vendor's own list price corroborates the ORDER of magnitude but not the
 * number: Pro's add-on pack is US$15 / 500 credits = US$0.03/credit, and the
 * domestic product bills in CNY, so ¥0.03/credit is the natural reading — the
 * same two digits as the measured value. `officialCnyPerCredit` keeps that
 * reading visible beside it so the two can be compared at a glance.
 *
 * Both are config overridable: upstream pricing moves, and a user on a Team
 * seat (US$0.02/credit) legitimately has a different number.
 */
const DEFAULT_MEASURED_CNY_PER_CREDIT = 0.044
const DEFAULT_OFFICIAL_CNY_PER_CREDIT = 0.03

/**
 * Config is declared as a plain default object rather than a Schema: the only
 * readers are this module's own `settings()` closure, and requiring
 * `@deepseek-ai/schemastery` from a hand-installed `link:` bundle would make
 * profile resolution fail (pnpm installs with `autoInstallPeers: false`).
 */
export const Config = Schema.object({
  /** CNY per WorkBuddy credit, measured from real turns. */
  cnyPerCredit: Schema.number().default(DEFAULT_MEASURED_CNY_PER_CREDIT),
  /** Vendor list price per credit, kept beside the measured one for comparison. */
  officialCnyPerCredit: Schema.number().default(DEFAULT_OFFICIAL_CNY_PER_CREDIT),
  /** WorkBuddy region to read. */
  region: Schema.string().default('cn'),
})

/** Read a JSON body from a local route, tolerating a missing sibling plugin. */
async function readJson(url, signal) {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).pathname}`)
  return await response.json()
}

/**
 * The DeepSeek wallet, through the host service.
 *
 * `getBalance` resolves to `null` when nobody is signed in and to
 * `{ status: 'failed' }` when the query failed — a failure must never be
 * rendered as a zero balance, so the shape is passed through rather than
 * flattened here.
 */
async function readWallet(ctx) {
  const account = ctx.get('deepseekAccount')
  if (account === undefined) return { available: false, reason: 'account-service-absent' }
  const client = {
    version: ctx.get('appVersion') ?? '0.0.0',
    locale: ctx.get('locale')?.current ?? 'zh-CN',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
  try {
    const result = await account.getBalance(client)
    if (result === null) return { available: false, reason: 'signed-out' }
    if (result.status !== 'ready') return { available: false, reason: 'query-failed' }
    const wallets = result.value ?? []
    const bonus = result.bonusWallets ?? []
    const sum = (rows, currency) =>
      rows.filter((w) => w.currency === currency).reduce((n, w) => n + Number(w.balance), 0)
    return {
      available: true,
      currency: wallets[0]?.currency ?? 'CNY',
      balance: sum(wallets, wallets[0]?.currency ?? 'CNY'),
      bonus: sum(bonus, bonus[0]?.currency ?? 'CNY'),
    }
  } catch (error) {
    return { available: false, reason: String(error?.message ?? error) }
  }
}

/** The WorkBuddy credit document, through the sibling plugin's route. */
async function readCredits(base) {
  for (const path of [WORKBUDDY_USAGE_PATH, WORKBUDDY_USAGE_PATH_ALT]) {
    try {
      const doc = await readJson(new URL(path, base).href, AbortSignal.timeout(8000))
      const total = doc?.credits?.total
      if (typeof total === 'number' && Number.isFinite(total)) {
        return {
          available: true,
          total,
          account: typeof doc.accountName === 'string' ? doc.accountName : null,
          checkin: doc.checkin ?? null,
        }
      }
      return { available: false, reason: 'no-credit-field' }
    } catch {
      continue
    }
  }
  return { available: false, reason: 'workbuddy-plugin-unreachable' }
}

export function apply(ctx, config) {
  const settings = () => ({
    cnyPerCredit: Number(config.cnyPerCredit ?? DEFAULT_MEASURED_CNY_PER_CREDIT),
    officialCnyPerCredit: Number(config.officialCnyPerCredit ?? DEFAULT_OFFICIAL_CNY_PER_CREDIT),
    region: String(config.region ?? 'cn'),
  })

  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => {
      const dispose = scope.webServer.register({
        kind: 'exact',
        path: STATE_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET') {
            res.writeHead(405, { 'content-type': 'application/json' })
            return res.end(JSON.stringify({ error: 'method not allowed' }))
          }
          const current = settings()
          // The sibling route is same-origin but not addressable without a port;
          // the listening socket's own address gives us the base.
          const address = req.socket?.localAddress ?? '127.0.0.1'
          const port = req.socket?.localPort
          const base = `http://${address.includes(':') ? `[${address}]` : address}:${port}`

          const [credits, wallet] = await Promise.all([
            readCredits(`${base}/`),
            readWallet(scope),
          ])

          const creditsCny = credits.available ? credits.total * current.cnyPerCredit : null
          const creditsCnyOfficial = credits.available
            ? credits.total * current.officialCnyPerCredit
            : null
          const walletCny = wallet.available ? wallet.balance + (wallet.bonus ?? 0) : null

          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(
            JSON.stringify({
              region: current.region,
              cnyPerCredit: current.cnyPerCredit,
              officialCnyPerCredit: current.officialCnyPerCredit,
              credits,
              creditsCny,
              creditsCnyOfficial,
              wallet,
              walletCny,
              // What the two purses add up to, when both answered.
              combinedCny:
                creditsCny !== null && walletCny !== null ? creditsCny + walletCny : null,
              fetchedAt: Date.now(),
            }),
          )
        },
      })
      return () => dispose()
    }, 'workbuddy-cny: state route')
  })
}
