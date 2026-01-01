import { chromium, Browser, Page, BrowserContext } from 'playwright';

const SEARCH_KEYWORD = 'AirPods';
const MAX_RETRIES = 3;

/**
 * 模拟人类行为
 */
async function humanize(page: Page) {
  await page.evaluate(() => {
    const scrollStep = Math.floor(Math.random() * 500) + 200;
    window.scrollBy(0, scrollStep);
  });
  
  const delay = Math.random() * 2000 + 1000;
  await page.waitForTimeout(delay);
}

async function runTaoBaoScraperWithPlaywright() {
  let browser: Browser | null = null;

  try {
    console.log('🚀 启动 Playwright 浏览器...');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu',
        '--start-maximized',
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      bypassCSP: true,
      locale: 'zh-CN',
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    // 添加反检测脚本
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      
      // @ts-ignore
      window.chrome = {
        runtime: {},
        loadTimes: () => ({}),
        csi: () => ({})
      };
      
      // 模拟插件
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // 模拟语言
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh']
      });
    });

    const page = await context.newPage();

    console.log('📱 正在访问淘宝...');
    await page.goto('https://www.taobao.com', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });

    // 等待搜索框可见并输入
    console.log(`🔍 搜索关键词: ${SEARCH_KEYWORD}`);
    const searchBox = page.locator('#q');
    await searchBox.waitFor({ state: 'visible', timeout: 15000 });
    
    await searchBox.fill(SEARCH_KEYWORD);
    await humanize(page);
    
    // 点击搜索
    await page.locator('.btn-search').click();
    
    // 等待跳转到搜索结果页
    await page.waitForURL(/s\.taobao\.com/);
    await page.waitForLoadState('networkidle');
    console.log('✅ 搜索结果页加载完成');

    // 处理登录弹窗
    try {
      const loginClose = page.locator('.login-password-login-box-close, .login-box-close');
      if (await loginClose.count() > 0) {
        console.log('❌ 检测到登录弹窗，正在关闭...');
        await loginClose.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      // 忽略错误
    }

    // 等待商品列表加载
    await page.locator('.Card--doubleCardWrapper--L2xFEvA').first().waitFor({ timeout: 15000 });
    
    // 模拟滚动加载
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(1000);
    }

    // 点击第一个商品
    const firstProduct = page.locator('.Card--doubleCardWrapper--L2xFEvA a').first();
    const productUrl = await firstProduct.getAttribute('href');
    const fullProductUrl = productUrl?.startsWith('http') ? productUrl : `https:${productUrl}`;
    console.log(`🎯 进入商品页: ${fullProductUrl}`);

    // 在新标签页打开商品
    const productPage = await context.newPage();
    await productPage.goto(fullProductUrl!, { waitUntil: 'networkidle' });

    // 等待商品详情
    await productPage.locator('.ItemHeader--itemTitle--ZCHqB1B').waitFor({ timeout: 15000 });
    
    // 处理登录弹窗
    try {
      const loginClose = productPage.locator('.login-password-login-box-close, .login-box-close');
      if (await loginClose.count() > 0) {
        await loginClose.click();
        await productPage.waitForTimeout(2000);
      }
    } catch (e) {
      // 忽略
    }

    console.log('💬 正在查找评价区域...');
    
    // 点击评价标签
    const commentTab = productPage.locator('[data-index="1"]');
    await commentTab.waitFor({ state: 'visible', timeout: 10000 });
    await commentTab.click();
    
    // 等待评价加载
    await productPage.locator('.Content--content--sgSCZ12').first().waitFor({ timeout: 15000 });
    console.log('✅ 评价内容加载完成');

    // 筛选有图评价
    try {
      const picFilter = productPage.locator('span').filter({ hasText: '有图' });
      if (await picFilter.count() > 0) {
        console.log('🖼️ 筛选有图评价...');
        await picFilter.click();
        await productPage.waitForLoadState('networkidle');
        await productPage.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('⚠️ 未找到有图筛选按钮');
    }

    // 提取评价和图片信息
    const reviews = await productPage.evaluate(() => {
      const reviewElements = document.querySelectorAll('.Content--content--sgSCZ12');
      const data: any[] = [];

      reviewElements.forEach((review, index) => {
        const images = review.querySelectorAll('.Thumb--thumbItem--1eYmkd6 img');
        if (images.length > 0) {
          const text = review.querySelector('.Content--content--sgSCZ12')?.textContent?.trim() || '';
          const imageUrls = Array.from(images).map(img => {
            const url = img.getAttribute('src') || '';
            return url.replace(/_\d+x\d+\.jpg/, ''); // 获取原图
          });

          data.push({
            index: index + 1,
            text: text.substring(0, 100) + '...',
            imageCount: images.length,
            images: imageUrls
          });
        }
      });

      return data;
    });

    console.log('\n🎉 成功获取到以下带图评价:\n');
    reviews.forEach(review => {
      console.log(`评价 #${review.index}:`);
      console.log(`文本: ${review.text}`);
      console.log(`图片数量: ${review.imageCount}`);
      console.log(`图片URL: ${review.images.join('\n  - ')}\n`);
    });

    // 截图保存
    await productPage.screenshot({ path: 'taobao_product_playwright.png', fullPage: true });
    console.log('📸 已保存截图: taobao_product_playwright.png');

    await productPage.close();

  } catch (error) {
    console.error('❌ 执行失败:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTaoBaoScraperWithPlaywright();
