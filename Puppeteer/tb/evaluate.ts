import puppeteer, { Browser, Page } from 'puppeteer';

const SEARCH_KEYWORD = 'AirPods';
const MAX_RETRIES = 3;

/**
 * 绕过淘宝检测的初始化脚本
 */
const evasionScript = () => {
  // 禁用 webdriver 检测
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  
  // 模拟.chrome 属性
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
  
  // 模拟.permissions
  // @ts-ignore
  navigator.permissions = {
    query: (parameters: any) => Promise.resolve({ state: 'granted', onchange: null })
  };
};

/**
 * 模拟人类行为
 */
async function humanize(page: Page) {
  await page.evaluate(() => {
    // 随机滚动
    const scrollStep = Math.floor(Math.random() * 500) + 200;
    window.scrollBy(0, scrollStep);
  });
  
  // 随机延迟 1-3秒
  const delay = Math.random() * 2000 + 1000;
  await page.waitForTimeout(delay);
}

async function runTaoBaoScraperWithPuppeteer() {
  let browser: Browser | null = null;

  try {
    console.log('🚀 启动浏览器...');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu',
        '--start-maximized',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      defaultViewport: null,
    });

    const page = await browser.newPage();
    
    // 设置真实浏览器环境
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 执行反检测脚本
    await page.evaluateOnNewDocument(evasionScript);

    console.log('📱 正在访问淘宝...');
    // 淘宝对直接访问可能有检测，先访问首页
    await page.goto('https://www.taobao.com', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // 等待搜索框并输入关键词
    console.log(`🔍 搜索关键词: ${SEARCH_KEYWORD}`);
    await page.waitForSelector('#q', { timeout: 15000 });
    
    // 模拟真实打字
    await page.type('#q', SEARCH_KEYWORD, { delay: 150 });
    await humanize(page);
    
    // 点击搜索按钮
    await page.click('.btn-search');
    
    // 等待搜索结果
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('✅ 搜索结果页加载完成');

    // 处理可能的登录框
    try {
      const loginClose = await page.$('.login-password-login-box-close, .login-box-close');
      if (loginClose) {
        console.log('❌ 检测到登录弹窗，正在关闭...');
        await loginClose.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('✅ 无登录弹窗');
    }

    // 等待商品列表
    await page.waitForSelector('.Card--doubleCardWrapper--L2xFEvA', { timeout: 10000 });
    
    // 模拟滚动加载更多商品
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(1000);
    }

    // 点击第一个商品
    const firstProduct = await page.$('.Card--doubleCardWrapper--L2xFEvA a');
    if (!firstProduct) {
      throw new Error('未找到商品链接');
    }

    const productUrl = await page.evaluate(el => el.href, firstProduct);
    console.log(`🎯 进入商品页: ${productUrl}`);

    // 在新页面打开商品详情
    const productPage = await browser.newPage();
    await productPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await productPage.setViewport({ width: 1920, height: 1080 });
    await productPage.evaluateOnNewDocument(evasionScript);
    
    await productPage.goto(productUrl, { waitUntil: 'networkidle2' });

    // 等待商品详情加载
    await productPage.waitForSelector('.ItemHeader--itemTitle--ZCHqB1B', { timeout: 15000 });
    
    // 处理可能的登录弹窗
    try {
      const loginClose = await productPage.$('.login-password-login-box-close, .login-box-close');
      if (loginClose) {
        await loginClose.click();
        await productPage.waitForTimeout(2000);
      }
    } catch (e) {
      // 忽略错误
    }

    console.log('💬 正在查找评价区域...');
    
    // 滚动到评价区域
    await productPage.evaluate(() => {
      const commentTab = document.querySelector('[data-index="1"]'); // 评价标签
      if (commentTab) {
        commentTab.scrollIntoView({ behavior: 'smooth' });
      }
    });

    // 等待并点击评价标签
    await productPage.waitForSelector('[data-index="1"]', { timeout: 10000 });
    await productPage.click('[data-index="1"]');
    
    // 等待评价内容加载
    await productPage.waitForSelector .Content--content--sgSCZ12', { timeout: 15000 });
    console.log('✅ 评价内容加载完成');

    // 筛选有图评价
    try {
      const picFilter = await productPage.$('span:has-text("有图")');
      if (picFilter) {
        console.log('🖼️ 筛选有图评价...');
        await picFilter.click();
        await productPage.waitForTimeout(3000);
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
    await productPage.screenshot({ path: 'taobao_product_puppeteer.png', fullPage: true });
    console.log('📸 已保存截图: taobao_product_puppeteer.png');

    await productPage.close();

  } catch (error) {
    console.error('❌ 执行失败:', error);
    if (browser) await browser.close();
    process.exit(1);
  }
}

runTaoBaoScraperWithPuppeteer();
