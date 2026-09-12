# Product simulation

Use the real rendered app with Playwright keyboard events, Chromium fake video and
explicit synthetic finger observations. This checks product behavior, **not camera
recognition accuracy**. The existing worker fixture preserves capture-time pose
history; production code still owns grading, retries, timing and persistence.
Every test gets a new temporary browser context. Never supply a personal browser
profile, saved storage or private footage.

## Run and inspect

```sh
# Builds the current commit for production and starts an isolated local server.
PLAYWRIGHT_PORT=4285 pnpm exec playwright test e2e/product-journeys.spec.ts --trace on

# Watch the same journeys; Inspector supports pause and step through UI actions.
PLAYWRIGHT_PORT=4285 pnpm exec playwright test e2e/product-journeys.spec.ts --debug

# Reproducible cadence and a bounded two-exercise session (actual UI restart).
PRODUCT_SEED=285 PRODUCT_EXERCISES=2 PLAYWRIGHT_PORT=4285 \
  pnpm exec playwright test e2e/product-journeys.spec.ts --grep 'complete exercise' --headed --trace on

# Review the trace path printed on failure, or a retained trace from --trace on.
pnpm exec playwright show-trace test-results/<test-directory>/trace.zip
```

For an already built local server or verified PR preview, set
`PLAYWRIGHT_BASE_URL`, `PRODUCT_SHA` (full candidate SHA), and `PRODUCT_BASE_SHA`
(intended base SHA). Verify the provider's preview manifest before the run. The
driver independently rejects an app whose embedded build SHA differs from
`PRODUCT_SHA`; without an override it requires the runner checkout's HEAD. Never
claim a dirty source build is a clean commit: commit source changes first. Test-only
runner edits are listed separately in the report. Changes to the candidate
invalidate affected evidence.

Use `--headed` to observe without Inspector. Synthetic sessions have a visible
fixture label and labeled browser title; these exist only in test contexts.
Commands accept normal Playwright `--grep`, `--reporter=html` and `--repeat-each`.
The normal `pnpm test:e2e` discovers these journeys, so required Verify CI runs them
and uploads their reports/screenshots and failure traces through the existing
`browser-verification` artifact. No separate scheduler, workflow or package script
is necessary.

## Write a scenario

Scenarios are ordinary async TypeScript tests importing `test` and `expect` from
`e2e/product-driver.ts`. Use the `product` fixture and Playwright for additional
visible controls. This keeps one production state machine and one test framework.

```ts
import { test, expect } from './product-driver';

test('a wrong finger survives correction', async ({ product: p, page }) => {
  await p.check('fresh ready target', { target: 'a', focus: 'typing' });
  await p.press('a', 'left-index', { code: 'KeyA', cadenceMs: 120 });
  await p.backspace();
  await p.type('a', ['unknown']);
  await p.submit('left-thumb');
  await expect(page.locator('#feedback')).toContainText('saw left index');
  await p.checkpoint('wrong-finger-feedback');
  await p.retry();
  await p.correctWord('traditional-right-thumb');
});
```

- `target()` reads the active rendered word. `press(character, observation, options)`
  takes a required actual finger or `unknown`; `type(text, observations)` requires
  one observation per character. `code` uses Playwright physical codes such as
  `KeyA`. Keys go to the currently focused element; the driver never silently
  focuses the typing field before a press. Use `page.keyboard` for control and
  deliberately unfocused events.
- `submit(observation)`, `backspace()`, `retry()`, `pause()`, `resume()`,
  `openSettings(group)`, `closeSettings()` and `reload()` operate normal UI paths.
  Resume is explicit; closing stays paused. `wait(ms)` permits deliberate pauses.
- `correctWord(policy)` requires and reports either `traditional-left-thumb` or
  `traditional-right-thumb`. Only this convenience method uses the traditional
  fixture map. Explicit wrong/unknown presses never consult expected fingers.
  Do not use this convenience policy to assert correctness for an alternate
  fingering policy or changed physical calibration; supply explicit observations
  and matching synthetic geometry for those scenarios.
- `pose(key, observation)` and `delayInference(ms)` control external evidence for
  timing cases; missing hands use `unknown`. Normal known presses hold the pose
  for 100 ms either side, unknowns for 550 ms to clear the ±500 ms search window.
  Seeded cadence adds 0–40 ms by default; browser/capture timing remains real.
  Reproducible inputs do not promise deterministic OS scheduling.
- `exercise(policy, maxWords)` reads targets until real completion, with a bound
  (80 by default); `session(count, policy)` runs 1–5 exercises using the existing
  Practise again button. No stage/counter/threshold is written. Fresh calibration
  is clicked through UI; reload exercises the state that the app actually saved.
- `check(label, expected)` records expected and actual visible target, input,
  feedback, counters, focus and drawer state. `checkpoint(label)` attaches a
  screenshot; `transition(label, action)` records before/after state.
  `persisted()` only reads the test context's local state. Use normal Playwright
  assertions for detailed results and future progress UI.

Optional `PRODUCT_DATE=2026-09-13T12:00:00Z` fixes Date only, leaving performance,
video capture timestamps and timers real. For a later day-boundary scenario use
`page.clock.setFixedTime(new Date(...))`; do not fast-forward capture/inference or
fabricate timestamps. Adaptive progression, weak-key revisits, per-key metrics,
heatmaps and daily goals are added with ALO-280/282/283/284 when implemented. These
initial scenarios make no claims about absent features.

## Evidence and ownership

Each run attaches `synthetic-product-report` JSON with app SHA/base/URL, runner
SHA/changes, seed, scenario version, browser version, input observations, fixture
policy, before/after transitions, assertions, errors and result. Screenshots cover
fresh setup and significant transitions; retain all traces with `--trace on` for
candidate audits. Read failures alongside the trace rather than treating a passing
assertion count as a usability judgment.

The Product tester independently inspects feedback clarity, focus, stable keyboard
layout and recovery, then publishes role-prefixed GitHub reviews with exact head,
scenario/command, expected/actual and evidence. Builder fixes product defects;
reviewer verifies fixes/resolves threads and owns merge. Tester owns only assigned
tooling and never self-merges. Linear holds specification/product discussion and ordinary issue fields. Keep
implementation recovery context on the PR; direct task messages route its actual
PR/comment links without mirrored Linear checkpoint or relay comments.

Manager dispatches candidate-head runs, broader hourly exploration without overlap,
and post-deploy smoke after checking artifact identity. Record actual run times
and coverage, not an implied completed schedule; stay quiet on unchanged failures.
Keep genuine model startup/network smoke (`e2e/model.spec.ts`) and physical-camera
acceptance separate. Individual contributors can run these commands without
operating a team of agents.
