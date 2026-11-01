const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync(__dirname + '/../web/public/icon.svg', 'utf8');
  const b = await chromium.launch();
  for (const s of [180, 192, 512, 72]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<style>*{margin:0}svg{width:${s}px;height:${s}px;display:block}</style>${svg}`);
    await p.screenshot({ path: `${__dirname}/../web/public/${s === 72 ? 'badge-72' : 'icon-' + s}.png` });
  }
  await b.close();
})();
