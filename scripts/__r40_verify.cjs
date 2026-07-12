// R40 验证: 竖屏入口按钮 → 全屏全展示 → 点节点显连接
const PW = 'C:/Users/I585134/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core';
const { chromium } = require(PW);
const BASE = 'http://localhost:8081';
const OUT = 'C:/ClaudeCodeProjects/K0/docs/qa/sprint16-evidence';
const USER = 'frank', PW_ = 'R38verify_temp_2026';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/I585134/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(11000);
    const inputs = await page.locator('input').all();
    await inputs[0].fill(USER); await inputs[1].fill(PW_);
    await page.getByText('登录', { exact: true }).last().click(); await sleep(11000);
    await page.goto(`${BASE}/episode/3`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(7000);
    // 竖屏: 找"全屏查看知识脑图"入口按钮
    const entry = page.getByText('全屏查看知识脑图', { exact: false }).first();
    await entry.scrollIntoViewIfNeeded(); await sleep(1000);
    await page.screenshot({ path: `${OUT}/r40-portrait-entry.png` });
    console.log('竖屏入口按钮:', await entry.count() > 0 ? '找到' : '未找到');
    // 点入口 → 全屏
    await entry.click(); await sleep(4500);
    await page.screenshot({ path: `${OUT}/r40-fullscreen-all.png` });
    console.log('全屏截图 done');
    // 点一个节点 (画布中部) → 看是否只显连接
    const gb = await page.evaluate(() => {
      const svgs=[...document.querySelectorAll('svg')]; let b=null,ba=0;
      for(const s of svgs){const r=s.getBoundingClientRect();const a=r.width*r.height;if(a>ba){ba=a;b=s;}}
      if(!b) return null;
      const circles=[...b.querySelectorAll('circle')]; let pick=null,pr=0;
      for(const c of circles){const bb=c.getBoundingClientRect();const cx=bb.x+bb.width/2,cy=bb.y+bb.height/2,r=bb.width/2; if(cy>80&&cy<760&&r>pr){pr=r;pick={cx,cy};}}
      return pick;
    });
    if (gb) { await page.mouse.click(gb.cx, gb.cy); await sleep(2500); await page.screenshot({ path: `${OUT}/r40-node-connections.png` }); console.log('点节点截图 done'); }
    console.log('errors:', errs.length ? JSON.stringify(errs.slice(0,5)) : '0');
  } catch(e) { console.error('ERR:', e.message); await page.screenshot({path:`${OUT}/r40-ERR.png`}).catch(()=>{}); }
  finally { await browser.close(); }
})();
