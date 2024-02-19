import { chromium, firefox, webkit } from 'playwright';

(async () => {
  const browser = await webkit.launch({
    headless: false
  });  // Or 'firefox' or 'webkit'.
  const page = await browser.newPage();
  await page.goto('http://google.com');
  // other actions...
  // await browser.close();
})();
