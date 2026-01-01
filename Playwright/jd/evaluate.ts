import { chromium, Browser, Page } from 'playwright';

const SEARCH_KEYWORD = 'iPhone 15';
const JD_ITEM_BASE_URL = 'https://item.jd.com';

/**
 * 主执行函数 - Playwright 版本
 */
async function runJdScraperWithPlaywright() {
  let browser: Browser | null = null;

  try {
    // 启动浏览器
    browser = await chromium.launch({
      headless: false, // 设为false方便观察
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Playwright 特有的反检测配置
      bypassCSP: true,
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });

    // 添加初始化脚本绕过检测
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // @ts-ignore
      delete navigator.__proto__.connection;
    });

    const page = await context.newPage();
    
    console.log('🚀 正在访问京东首页...');
    await page.goto('https://www.jd.com', { waitUntil: 'networkidle' });

    // Playwright 的 locator 方式定位元素
    const searchBox = page.locator('#key');
    await searchBox.waitFor({ state: 'visible', timeout: 10000 });
    
    console.log(`🔍 正在搜索商品: ${SEARCH_KEYWORD}`);
    // 输入搜索关键词
    await searchBox.fill(SEARCH_KEYWORD);
    
    // 点击搜索按钮
    await page.locator('.button').click();
    
    // 等待搜索结果加载
    await page.waitForURL(/search\.jd\.com/);
    await page.waitForLoadState('networkidle');
    console.log('✅ 搜索结果页加载完成');

    // 等待商品列表加载并点击第一个商品
    const firstProduct = page.locator('.gl-item .p-name a').first();
    await firstProduct.waitFor({ state: 'visible', timeout: 10000 });
    
    // 获取商品链接
    const productUrl = await firstProduct.getAttribute('href');
    const fullProductUrl = productUrl?.startsWith('http') ? productUrl : `https:${productUrl}`;
    console.log(`🎯 正在进入商品详情页: ${fullProductUrl}`);

    // 在新页面中打开商品详情
    const productPage = await context.newPage();
    await productPage.goto(fullProductUrl!, { waitUntil: 'networkidle' });
    
    // 等待商品标题加载
    await productPage.locator('.sku-name').waitFor({ timeout: 10000 });
    console.log('✅ 商品详情页加载完成');

    // 点击评价标签 - Playwright 会自动滚动到可见区域
    const commentTab = productPage.locator('[data-anchor="#comment"]');
    await commentTab.waitFor({ state: 'visible', timeout: 5000 });
    
    console.log('💬 正在点击评价标签...');
    await commentTab.click();
    
    // 等待评价内容加载 - Playwright 智能等待机制
    await productPage.locator('.comment-item').first().waitFor({ timeout: 10000 });
    console.log('✅ 评价内容加载完成');

    // 筛选带图片的评价
    const picFilter = productPage.locator('.filter-item').filter({
      hasText: '晒图'
    });
    if (await picFilter.count() > 0) {
      console.log('🖼️ 正在筛选带图评价...');
      await picFilter.click();
      // 等待筛选结果加载
      await productPage.waitForLoadState('networkidle');
    }

    // 获取评价图片信息 - 使用 Playwright 的 evaluate
    const imageData = await productPage.evaluate(() => {
      const comments = document.querySelectorAll('.comment-item');
      const results: any[] = [];

      comments.forEach((comment, index) => {
        const images = comment.querySelectorAll('.pic-list img');
        if (images.length > 0) {
          const commentText = comment.querySelector('.comment-con')?.textContent?.trim() || '';
          const imageUrls = Array.from(images).map(img => {
            const thumbUrl = img.getAttribute('src') || '';
            // 京东缩略图和大图转换逻辑
            return thumbUrl.includes('n0/') ? 
              thumbUrl.replace('n0/', 'shaidan/') : 
              thumbUrl.replace(/s\d+x\d+_/, 'shaidan/');
          });

          results.push({
            index: index + 1,
            comment: commentText.substring(0, 100) + '...',
            imageCount: images.length,
            images: imageUrls
          });
        }
      });

      return results;
    });

    console.log('\n🎉 成功获取到以下带图评价信息:\n');
    imageData.forEach(item => {
      console.log(`评价 #${item.index}:`);
      console.log(`文本: ${item.comment}`);
      console.log(`图片数量: ${item.imageCount}`);
      console.log(`图片URL: ${item.images.join('\n  - ')}\n`);
    });

    // 截图保存
    await productPage.screenshot({ path: 'jd_product_playwright.png', fullPage: true });
    console.log('📸 已保存截图: jd_product_playwright.png');

    await productPage.close();

  } catch (error) {
    console.error('❌ 执行出错:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 执行脚本
runJdScraperWithPlaywright();
