const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message, err.stack));
  await page.goto('http://127.0.0.1:4181', { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  await browser.close();
})();
