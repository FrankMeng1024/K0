// #R57 验证: 放射树楔形分配 → skeleton+belong 树边零交叉。
// 量化: 树边交叉数、圆重叠数、bbox 铺满率。对比基线约 26 交叉。
// 读渲染后的 SVG DOM (line=直边=skeleton/belong, path=贝塞尔=semantic 不计), circle=节点球。
const PW = 'C:/Users/I585134/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core';
const { chromium } = require(PW);
const BASE = 'http://localhost:8081';
const OUT = 'C:/ClaudeCodeProjects/K0/docs/qa/sprint16-evidence';
const USER = 'frank', PW_ = '123';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 线段相交 (排除共端点 —— 共父/共子的边天然共点, 不算交叉)
function segCross(a, b, c, d) {
  const share = (p, q) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
  if (share(a, c) || share(a, d) || share(b, c) || share(b, d)) return false;
  const o = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const s = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const d1 = s(o(a, b, c)), d2 = s(o(a, b, d)), d3 = s(o(c, d, a)), d4 = s(o(c, d, b));
  return d1 !== d2 && d3 !== d4;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/I585134/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  try {
    await page.goto(BASE, { waitUntil: 'commit', timeout: 120000 }); await sleep(18000);
    const inputs = await page.locator('input').all();
    if (inputs.length >= 2) {
      await inputs[0].fill(USER); await inputs[1].fill(PW_);
      await page.getByText('登录', { exact: true }).last().click(); await sleep(11000);
    }
    await page.goto(`${BASE}/episode/3?direct=1&packId=3`, { waitUntil: 'commit', timeout: 120000 }); await sleep(9000);
    const entry = page.getByText('全屏查看知识脑图', { exact: false }).first();
    console.log('竖屏入口按钮:', await entry.count() > 0 ? '找到' : '未找到');
    await entry.scrollIntoViewIfNeeded(); await sleep(800);
    await entry.click();
    // 等收敛 (loading 消失). 楔形模式确定性布局, 但仍等 collision 微调稳定。
    await sleep(6500);
    await page.screenshot({ path: `${OUT}/r57-fullscreen.png` });

    // 量化: 读最大 SVG 的 line(直边)+circle。line 端点匹配 circle 圆心 → 归类树边 (skeleton/belong)。
    const metrics = await page.evaluate(() => {
      const svgs = [...document.querySelectorAll('svg')];
      let svg = null, ba = 0;
      for (const s of svgs) { const r = s.getBoundingClientRect(); const a = r.width * r.height; if (a > ba) { ba = a; svg = s; } }
      if (!svg) return null;
      const circles = [...svg.querySelectorAll('circle')].map(c => {
        const b = c.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 };
      });
      // line = skeleton/belong 直边 (semantic 是 path 贝塞尔, 不计交叉)
      const lines = [...svg.querySelectorAll('line')].map(l => {
        const b = l.getBoundingClientRect();
        // 用 getBBox 端点不可靠; 读属性再换算 client 坐标
        return l;
      });
      // 用属性坐标 + CTM 换算到 client
      const pt = svg.createSVGPoint();
      const toClient = (x, y) => { pt.x = x; pt.y = y; const m = svg.getScreenCTM(); const r = pt.matrixTransform(m); return { x: r.x, y: r.y }; };
      const segs = [...svg.querySelectorAll('line')].map(l => {
        const a = toClient(+l.getAttribute('x1'), +l.getAttribute('y1'));
        const b = toClient(+l.getAttribute('x2'), +l.getAttribute('y2'));
        return { a, b };
      });
      const paths = svg.querySelectorAll('path').length;
      return { circles, segs, paths, lineCount: segs.length };
    });
    if (!metrics) { console.log('未找到 SVG'); await browser.close(); return; }

    // 树边交叉
    let cross = 0;
    const S = metrics.segs;
    for (let i = 0; i < S.length; i++)
      for (let j = i + 1; j < S.length; j++)
        if (segCross(S[i].a, S[i].b, S[j].a, S[j].b)) cross++;

    // 圆重叠 (中心距 < r_i+r_j - 2px 容差)
    let overlap = 0;
    const C = metrics.circles;
    for (let i = 0; i < C.length; i++)
      for (let j = i + 1; j < C.length; j++) {
        const dx = C[j].x - C[i].x, dy = C[j].y - C[i].y;
        const d = Math.hypot(dx, dy);
        if (d < C[i].r + C[j].r - 2) overlap++;
      }

    // 铺满率: 节点 bbox / 视口
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const c of C) { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y); }
    const vp = page.viewportSize();
    const fillW = (maxX - minX) / vp.width, fillH = (maxY - minY) / vp.height;

    console.log('=== R57 量化 ===');
    console.log('节点球数:', C.length, '| 树边(直线)数:', metrics.lineCount, '| semantic(path)数:', metrics.paths);
    console.log('树边交叉数 (skeleton+belong):', cross, '  [基线约 26, 目标 ≈0]');
    console.log('圆重叠数:', overlap, '  [目标 0]');
    console.log('铺满率 W:', fillW.toFixed(2), 'H:', fillH.toFixed(2), '  [越接近 1 越铺满]');

    // 拖球: 拖一个中部节点确认跟手
    const gb = await page.evaluate(() => {
      const svgs = [...document.querySelectorAll('svg')]; let b = null, ba = 0;
      for (const s of svgs) { const r = s.getBoundingClientRect(); const a = r.width * r.height; if (a > ba) { ba = a; b = s; } }
      const circles = [...b.querySelectorAll('circle')]; let pick = null, pr = 0;
      for (const c of circles) { const bb = c.getBoundingClientRect(); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2, r = bb.width / 2; if (cy > 90 && cy < 340 && cx > 120 && cx < 780 && r > pr) { pr = r; pick = { cx, cy }; } }
      return pick;
    });
    if (gb) {
      await page.mouse.move(gb.cx, gb.cy); await page.mouse.down();
      await page.mouse.move(gb.cx + 90, gb.cy + 40, { steps: 8 }); await page.mouse.up();
      await sleep(800);
      await page.screenshot({ path: `${OUT}/r57-after-drag.png` });
      console.log('拖球截图 done (拖 +90,+40)');
    }
    // 重排
    const reBtn = page.getByText('重排', { exact: true }).first();
    if (await reBtn.count()) { await reBtn.click(); await sleep(3500); await page.screenshot({ path: `${OUT}/r57-reheat.png` }); console.log('重排截图 done'); }

    console.log('console errors:', errs.length ? JSON.stringify(errs.slice(0, 6)) : '0');
  } catch (e) { console.error('ERR:', e.message); await page.screenshot({ path: `${OUT}/r57-ERR.png` }).catch(() => {}); }
  finally { await browser.close(); }
})();
