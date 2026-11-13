#!/usr/bin/env node
/* Couch Co-op acceptance harness.
 *
 * The shipped file (master.html) is built by build.sh from the parts in src/. A game is one file in src/.
 *
 *   node tools/check.mjs --list                          which slots are built
 *   node tools/check.mjs --baseline                      health of the master as it stands
 *   node tools/check.mjs --slot pit-crew                 the ten checks for a new or polished game
 *   node tools/check.mjs --slot rope-bridge --replace pit-crew   a replacement game in pit-crew's slot
 *
 * Options: --base <git ref> (default origin/main, else main), --out <dir> (default /tmp/check).
 * Exit code 0 means every check passed. Thresholds live in tools/check.config.json.
 * Owned by Marco. The Game Builder runs this file and never edits it.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/check.config.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const OUT = path.resolve(opt('out') || '/tmp/check');
CFG.step = 1 / CFG.simStepsPerSecond;
fs.mkdirSync(OUT, { recursive: true });

// ---- Browser ---------------------------------------------------------------------------------------
async function loadPlaywright() {
  const tries = [() => import('playwright'), () => import('playwright-core'),
    () => createRequire('/opt/npm-tools/node_modules/')('playwright'),
    () => createRequire(path.join(ROOT, 'node_modules/'))('playwright-core')];
  for (const t of tries) { try { const m = await t(); return m.chromium ? m : m.default; } catch (e) { /* next */ } }
  throw new Error('Playwright not found. Run: npm i --no-save playwright-core');
}
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) if (fs.existsSync(p)) return p;
  return undefined;                                   // Playwright's own browser
}
let browser;
async function openPage(file) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const log = { errors: [], network: [] };
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (['file:', 'data:', 'blob:'].includes(u.protocol)) return route.continue();
    if (CFG.allowedHosts.includes(u.hostname)) return route.abort();   // fonts: allowed, never needed
    log.network.push(u.href); return route.abort();
  });
  page.on('pageerror', e => log.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) log.errors.push(m.text()); });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof Couch !== 'undefined' && Couch.games && Couch.Engine, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { page, log };
}

// ---- The master's structure -------------------------------------------------------------------------
function blocksOf(html) {
  const re = /<script>([\s\S]*?)<\/script>\n?/g, blocks = []; let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  return { blocks, outside: html.replace(re, '') };
}
const idsIn = b => [...b.matchAll(/Couch\.register\(\{\s*id:\s*'([^']+)'/g)].map(m => m[1]);
const blockOf = (blocks, id) => blocks.findIndex(b => idsIn(b).includes(id));
const startIndex = blocks => blocks.findIndex(b => b.includes('Couch.Engine.init()'));
const manifestIndex = blocks => blocks.findIndex(b => b.includes('].forEach(([id, title, line, pace, size], i)'));

function baseFile(ref) {
  const tries = ref && ref !== true ? [ref] : ['origin/main', 'main'];
  for (const r of tries) {
    try {
      const html = execFileSync('git', ['show', r + ':' + CFG.master], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
      const f = path.join(OUT, 'base.html'); fs.writeFileSync(f, html); return { file: f, html, ref: r };
    } catch (e) { /* next */ }
  }
  throw new Error('Cannot read ' + CFG.master + ' from ' + tries.join(' or '));
}

// ---- In-page helpers --------------------------------------------------------------------------------
const built = page => page.evaluate(() => Couch.games.filter(g => typeof g.create === 'function').map(g => ({ id: g.id, n: g.n || null, title: g.title || g.id, bots: !!g.bots })));
const sim = (page, id, seed, assist, seconds) => page.evaluate(({ id, seed, assist, seconds, step }) => {
  try {
    const r = Couch.simulate(id, { seed, step, seconds, assists: [assist, assist] });
    return { won: r.result ? !!r.result.won : null, time: Math.round(r.time * 1000) / 1000, steps: r.steps, ended: !!r.result };
  } catch (e) { return { error: String(e && e.message || e) }; }
}, { id, seed, assist, seconds: seconds || CFG.maxGameSeconds, step: CFG.step });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const median = xs => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const mins = s => (s / 60).toFixed(1);

// ---- Report -------------------------------------------------------------------------------------------
const rows = [];
function record(n, name, status, detail) { rows.push({ n, name, status, detail }); console.error(`  ${n}. ${name}: ${status}${detail ? ' (' + detail + ')' : ''}`); }
function finish(title, extra = {}) {
  const ok = rows.every(r => r.status !== 'FAIL');
  const md = [`### ${title}: ${ok ? 'all checks pass' : 'FAILED'}`, '', '| # | Check | Result | Detail |', '| --- | --- | --- | --- |',
    ...rows.map(r => `| ${r.n} | ${r.name} | ${r.status} | ${String(r.detail || '').replace(/\|/g, '/')} |`)].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md + '\n');
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ title, ok, rows, ...extra }, null, 2));
  console.log(md);
  return ok;
}

// ---- Modes --------------------------------------------------------------------------------------------
async function list() {
  const { page } = await openPage(path.join(ROOT, CFG.master));
  const all = await page.evaluate(() => Couch.games.filter(g => g.n).map(g => ({ n: g.n, id: g.id, title: g.title, built: typeof g.create === 'function' })));
  console.log('| Slot | Id | Title | Built |\n| --- | --- | --- | --- |\n' + all.map(g => `| ${g.n} | ${g.id} | ${g.title} | ${g.built ? 'yes' : 'no'} |`).join('\n'));
  return true;
}

async function baseline() {
  const file = path.join(ROOT, CFG.master);
  const { page, log } = await openPage(file);
  record(2, 'Loads clean', log.errors.length || log.network.length ? 'FAIL' : 'pass',
    [...log.errors, ...log.network.map(u => 'network: ' + u)].slice(0, 3).join('; '));
  const games = await built(page), table = [];
  for (const g of games) {
    const runs = []; for (let s = 1; s <= CFG.neighbourSeeds; s++) runs.push(await sim(page, g.id, s, 0));
    const again = await sim(page, g.id, 1, 0), errs = runs.filter(r => r.error);
    const util = CFG.utilities.includes(g.id), ended = runs.filter(r => r.ended).length, wins = runs.filter(r => r.won).length;
    const bad = errs.length || !same(runs[0], again) || (!util && ended < runs.length);
    table.push({ id: g.id, slot: g.n, wins, ended, runs: runs.length, repeat: same(runs[0], again), errors: errs.map(r => r.error) });
    record(g.n ? 'slot ' + g.n : 'util', g.title, bad ? 'FAIL' : 'pass',
      `ended ${ended}/${runs.length}, bots won ${wins}, seed 1 repeats ${same(runs[0], again) ? 'exactly' : 'DIFFERENTLY'}${errs.length ? ', error: ' + errs[0].error : ''}`);
  }
  return finish('Baseline of ' + CFG.master, { games: table });
}

async function slotCheck(slot, oldId) {
  const branchFile = path.join(ROOT, CFG.master), base = baseFile(opt('base'));
  const B = blocksOf(base.html), N = blocksOf(fs.readFileSync(branchFile, 'utf8'));
  const builtOnBase = blockOf(B.blocks, slot) >= 0;
  const mode = oldId ? 'replace' : builtOnBase ? 'polish' : 'new';
  console.error(`Checking ${slot} (${mode}${oldId ? ' of ' + oldId : ''}) against ${base.ref}`);

  // 1. One block added (or changed, or swapped)
  {
    const fail = []; const s = startIndex(B.blocks);
    if (B.outside !== N.outside) fail.push('HTML outside the script blocks changed');
    let expect;                                                    // what the branch's blocks should be, with the slot's block as null
    if (mode === 'new') expect = [...B.blocks.slice(0, s), null, ...B.blocks.slice(s)];
    else if (mode === 'polish') expect = B.blocks.map((b, i) => (i === blockOf(B.blocks, slot) ? null : b));
    else {
      const j = blockOf(B.blocks, oldId), m = manifestIndex(B.blocks);
      const rest = B.blocks.map((b, i) => (i === m ? '§manifest' : b)).filter((b, i) => i !== j);
      const s2 = rest.findIndex(b => b.includes('Couch.Engine.init()'));
      expect = [...rest.slice(0, s2), null, ...rest.slice(s2)];
      if (j >= 0) {
        const kept = path.join(ROOT, 'retired', oldId + '.js');
        if (!fs.existsSync(kept) || fs.readFileSync(kept, 'utf8').trim() !== B.blocks.at(j).trim()) fail.push(`retired/${oldId}.js must hold the old game's source exactly`);
      }
    }
    if (expect.length !== N.blocks.length) fail.push(`expected ${expect.length} script blocks, found ${N.blocks.length}`);
    else expect.forEach((e, i) => {
      const got = N.blocks.at(i);
      if (e === null) {
        if (!idsIn(got).includes(slot)) fail.push(`block ${i + 1} does not register ${slot}`);
        if (idsIn(got).length !== 1) fail.push(`block ${i + 1} registers more than one game`);
        const body = got.replace(/^\s*(\/\*[\s\S]*?\*\/\s*)*/, '').trim();       // one closed scope: no shared top-level names
        if (!body.startsWith('(() => {') || !body.endsWith('})();')) fail.push(`block ${i + 1} must be one (() => { ... })(); scope after its header comment`);
      }
      else if (e === '§manifest') {
        const a = B.blocks.at(manifestIndex(B.blocks)).split('\n'), b = got.split('\n');
        const diff = a.map((l, k) => (l === b.at(k) ? null : k)).filter(k => k !== null);
        if (a.length !== b.length || diff.length !== 1 || !a.at(diff[0]).includes(`['${oldId}',`) || !b.at(diff[0]).includes(`['${slot}',`))
          fail.push(`the manifest may change only the ${oldId} row, to ${slot}`);
      } else if (e !== got) fail.push(`block ${i + 1} changed`);
    });
    // master.html must be exactly what build.sh makes from src/
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-'));
    fs.cpSync(path.join(ROOT, CFG.sourceDir), path.join(tmp, CFG.sourceDir), { recursive: true });
    fs.copyFileSync(path.join(ROOT, CFG.buildScript), path.join(tmp, CFG.buildScript));
    try { execFileSync('sh', [CFG.buildScript], { cwd: tmp, stdio: 'ignore' }); if (fs.readFileSync(path.join(tmp, CFG.master), 'utf8') !== fs.readFileSync(branchFile, 'utf8')) fail.push(`${CFG.master} is not what ${CFG.buildScript} builds from ${CFG.sourceDir}/`); }
    catch (e) { fail.push(`${CFG.buildScript} failed: ${e.message}`); }
    // nothing outside the game's own paths
    try {
      const changed = execFileSync('git', ['diff', '--name-only', base.ref + '...HEAD'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
      const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).map(l => l.slice(3));
      const outside = [...new Set([...changed, ...dirty])].filter(f => !CFG.agentPaths.some(p => f === p || f.startsWith(p)));
      if (outside.length) fail.push('changed outside the game: ' + outside.slice(0, 4).join(', '));
    } catch (e) { fail.push('git diff failed: ' + e.message); }
    record(1, mode === 'replace' ? 'One slot swapped' : mode === 'polish' ? 'Only its block changed' : 'One block added', fail.length ? 'FAIL' : 'pass', fail.slice(0, 3).join('; ') || mode);
  }

  const basePage = await openPage(base.file), page = await openPage(branchFile);
  // 2. Loads clean
  {
    const fail = [...page.log.errors, ...page.log.network.map(u => 'network call: ' + u)];
    const keys = p => p.evaluate(() => Object.keys(window));
    const before = new Set(await keys(basePage.page)), added = (await keys(page.page)).filter(k => !before.has(k));
    if (added.length) fail.push('new global names: ' + added.join(', '));
    const def = await page.page.evaluate(id => { const g = Couch.games.find(q => q.id === id); return g ? { create: typeof g.create === 'function', bots: !!g.bots } : null; }, slot);
    if (!def || !def.create) fail.push('slot has no create()'); else if (!def.bots) fail.push('bots: true missing');
    record(2, 'Loads clean', fail.length ? 'FAIL' : 'pass', fail.slice(0, 3).join('; '));
  }
  // 3. Contract
  {
    const c = await page.page.evaluate(({ id, step }) => {
      const g = Couch.games.find(q => q.id === id); if (!g || !g.create) return { fail: ['not registered'] };
      const fail = [];
      if (typeof g.n !== 'number') fail.push('id is not a manifest slot');
      if (!Array.isArray(g.how) || !g.how.length || g.how.length > 3) fail.push('how needs 1 to 3 lines');
      if (!Array.isArray(g.controls) || !g.controls.length) fail.push('controls missing');
      if (!Array.isArray(g.assistText) || g.assistText.length !== 3) fail.push('assistText needs 3 entries');
      if (![1, 2].includes(g.players)) fail.push('players must be 1 or 2');
      try { const r = Couch.simulate(id, { seed: 1, seconds: 0.1, step }); if (typeof r.inner.bot !== 'function') fail.push('no bot(seat, ctl) method'); }
      catch (e) { fail.push('create() threw: ' + e.message); }
      return { fail, title: g.title, n: g.n };
    }, { id: slot, step: CFG.step });
    record(3, 'Contract', c.fail.length ? 'FAIL' : 'pass', c.fail.join('; ') || `slot ${c.n}, ${c.title}`);
  }
  // 4–7. Simulation
  const runs = { 0: [], 2: [] };
  for (const a of [0, 2]) for (let s = 1; s <= CFG.seeds; s++) runs[a].push(await sim(page.page, slot, s, a));
  const again = await sim(page.page, slot, 1, 0);
  record(4, 'Repeatable', same(runs[0][0], again) && !again.error ? 'pass' : 'FAIL', `seed 1: ${JSON.stringify(runs[0][0])} then ${JSON.stringify(again)}`);
  {
    const all = [...runs[0], ...runs[2]], errs = all.filter(r => r.error), open = all.filter(r => !r.error && !r.ended);
    record(5, 'Finishes', errs.length || open.length ? 'FAIL' : 'pass',
      errs.length ? 'error: ' + errs[0].error : open.length ? `${open.length} of ${all.length} runs did not end within ${mins(CFG.maxGameSeconds)} min` : `${all.length} of ${all.length} runs ended`);
  }
  const w0 = runs[0].filter(r => r.won).length, w2 = runs[2].filter(r => r.won).length, noFail = CFG.noFailSlots.includes(slot);
  if (noFail) record(6, 'Winnable, not handed over', 'skip', 'no way to fail (tools/check.config.json)');
  else record(6, 'Winnable, not handed over', w0 >= CFG.winThresholdAssist0 && w2 >= w0 ? 'pass' : 'FAIL',
    `bots won ${w0}/${CFG.seeds} at assist 0, ${w2}/${CFG.seeds} at assist 2 (need ${CFG.winThresholdAssist0}+, and no fewer at assist 2)`);
  {
    const pool = [...runs[0], ...runs[2]].filter(r => r.ended && (noFail || r.won)).map(r => r.time), med = median(pool);
    const [lo, hi] = CFG.sessionMinutes;
    record(7, 'Session length', med != null && med >= lo * 60 && med <= hi * 60 ? 'pass' : 'FAIL',
      med == null ? 'no finished runs to measure' : `median ${mins(med)} min over ${pool.length} runs (need ${lo} to ${hi})`);
  }
  // 8. Draws on screen with two practice bots
  {
    const shots = [], errsBefore = page.log.errors.length;
    const okStart = await page.page.evaluate(id => {
      const g = Couch.games.find(q => q.id === id); if (!g || !g.create) return false;
      const S = Couch.Input.seats; for (const s of S.slice(0, 2)) if (!s.device) Couch.Input.addBot(s);
      Couch.Engine.go(() => new Couch.scenes.GameHost(g)); return true;
    }, slot);
    let t = 0;
    if (okStart) for (const at of CFG.screenSeconds) {
      await page.page.waitForTimeout((at - t) * 1000); t = at;
      const f = path.join(OUT, `${slot}-${at}s.png`); await page.page.screenshot({ path: f }); shots.push(f);
    }
    const running = okStart && await page.page.evaluate(() => Couch.Engine.scenes.some(s => s instanceof Couch.scenes.GameHost || s instanceof Couch.scenes.ResultsScene));
    const errs = page.log.errors.slice(errsBefore);
    record(8, 'Draws', okStart && running && !errs.length ? 'pass' : 'FAIL',
      errs.length ? 'error: ' + errs[0] : !running ? 'the game scene was not running' : `${CFG.screenSeconds.at(-1)} s on screen, screenshots in ${OUT}`);
  }
  // 9. Neighbours unchanged
  {
    const fail = [], skip = new Set([slot, oldId].filter(Boolean));
    const games = (await built(basePage.page)).filter(g => !skip.has(g.id));
    for (const g of games) for (let s = 1; s <= CFG.neighbourSeeds; s++) {
      const a = await sim(basePage.page, g.id, s, 0), b = await sim(page.page, g.id, s, 0);
      if (!same(a, b)) fail.push(`${g.id} seed ${s}: ${JSON.stringify(a)} became ${JSON.stringify(b)}`);
    }
    // Sounds: every sound that is not the slot's own (or the retired game's) must be unchanged
    let own = [];
    const j = blockOf(B.blocks, mode === 'replace' ? oldId : slot);
    if (j >= 0) {
      const without = B.blocks.filter((_, i) => i !== j), html = base.html.replace(/<script>[\s\S]*?<\/script>\n?/g, '§S§');
      let k = 0; const f = path.join(OUT, 'base-without.html');
      fs.writeFileSync(f, html.replace(/§S§/g, () => (k < without.length ? `<script>${without.at(k++)}</script>\n` : '')));
      const p = await openPage(f), all = Object.keys(await basePage.page.evaluate(() => Couch.Sfx.bank));
      const left = new Set(await p.page.evaluate(() => Object.keys(Couch.Sfx.bank))); own = all.filter(k2 => !left.has(k2)); await p.page.close();
    }
    const bank = p => p.evaluate(() => Object.fromEntries(Object.entries(Couch.Sfx.bank).map(([k2, fn]) => [k2, String(fn)])));
    const sa = await bank(basePage.page), sb = await bank(page.page);
    for (const k2 of Object.keys(sa)) if (!own.includes(k2) && sa[k2] !== sb[k2]) fail.push(`sound ${k2} ${k2 in sb ? 'replaced' : 'removed'}`);
    record(9, 'Neighbours unchanged', fail.length ? 'FAIL' : 'pass', fail.slice(0, 3).join('; ') || `${games.length} games x ${CFG.neighbourSeeds} seeds identical, sounds intact`);
  }
  // 10. Design rules, as written in the build log
  {
    const logFile = path.join(ROOT, 'agents/BUILD_LOG.md'), fail = [];
    const text = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    const sections = text.split(/\n(?=## )/).filter(s => s.startsWith('## ') && s.split('\n')[0].includes(slot));
    const sec = sections.at(-1) || '';
    if (!sec) fail.push(`no "## ... ${slot}" entry in agents/BUILD_LOG.md`);
    else for (const label of ['Two-player action', 'Hard part', 'Assists', ...[1, 2, 3, 4, 5, 6, 7].map(i => 'Rule ' + i)])
      if (!new RegExp(`^- ${label}: \\S`, 'm').test(sec)) fail.push(`missing "- ${label}:"`);
    record(10, 'Design rules', fail.length ? 'FAIL' : 'pass', fail.slice(0, 3).join('; ') || 'answered in the build log');
  }
  return finish(`${slot} (${mode}${oldId ? ' of ' + oldId : ''})`, { slot, mode, replaces: oldId || null, base: base.ref,
    bots: { assist0: w0, assist2: w2, seeds: CFG.seeds }, runs });
}

// ---- Main ---------------------------------------------------------------------------------------------
const pw = await loadPlaywright();
browser = await pw.chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
let ok = false;
try {
  if (opt('list')) ok = await list();
  else if (opt('baseline')) ok = await baseline();
  else if (typeof opt('slot') === 'string') ok = await slotCheck(opt('slot'), typeof opt('replace') === 'string' ? opt('replace') : null);
  else { console.error('Usage: node tools/check.mjs --list | --baseline | --slot <id> [--replace <old-id>] [--base <ref>] [--out <dir>]'); ok = false; }
} catch (e) { console.error(e.stack || e); ok = false; }
finally { await browser.close(); }
process.exit(ok ? 0 : 1);
