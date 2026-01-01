import puppeteer, { Browser, Page } from 'puppeteer';

// 商品搜索关键词
const SEARCH_KEYWORD = 'iPhone 15';
// 京东商品详情页基础URL（用于验证是否进入详情页）
const JD_ITEM_BASE_URL = 'https://item.jd.com';

/**
 * 主执行函数
 */
async function runJdScraperWithPuppeteer() {
  let browser: Browser | null = null;

  try {
    // 启动浏览器
    browser = await puppeteer.launch({
      headless: false, // 设为false方便观察调试，生产环境可设为true
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // 禁用自动化控制标识
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });

    const page = await browser.newPage();
    
    // 设置 viewport 模拟真实用户
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 绕过 WebDriver 检测
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });

    console.log('🚀 正在访问京东首页...');
    await page.goto('https://www.jd.com', { waitUntil: 'networkidle2' });

    // 等待搜索框加载
    await page.waitForSelector('#key', { timeout: 10000 });
    
    console.log(`🔍 正在搜索商品: ${SEARCH_KEYWORD}`);
    // 输入搜索关键词
    await page.type('#key', SEARCH_KEYWORD, { delay: 100 }); // delay模拟人类打字速度
    
    // 点击搜索按钮
    await page.click('.button');
    
    // 等待搜索结果页加载
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('✅ 搜索结果页加载完成');

    // 等待商品列表加载
    await page.waitForSelector('.gl-item', { timeout: 10000 });
    
    // 获取第一个商品链接并点击
    const firstProductLink = await page.$('.gl-item .p-name a');
    if (!firstProductLink) {
      throw new Error('未找到商品链接');
    }

    // 获取商品链接地址
    const productUrl = await page.evaluate(el => el.href, firstProductLink);
    console.log(`🎯 正在进入商品详情页: ${productUrl}`);
    
    // 在新页面中打开商品详情
    const productPage = await browser.newPage();
    await productPage.setViewport({ width: 1920, height: 1080 });
    
    // 同样绕过检测
    await productPage.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });
    
    await productPage.goto(productUrl, { waitUntil: 'networkidle2' });

    // 等待商品详情页加载
    await productPage.waitForSelector('.sku-name', { timeout: 10000 });
    console.log('✅ 商品详情页加载完成');

    // 滚动到评价区域
    await productPage.evaluate(() => {
      const commentTab = document.querySelector('[data-anchor="#comment"]');
      if (commentTab) {
        commentTab.scrollIntoView({ behavior: 'smooth' });
      }
    });

    // 等待评价标签可点击
    await productPage.waitForSelector('[data-anchor="#comment"]', { timeout: 5000 });
    
    console.log('💬 正在点击评价标签...');
    // 点击评价标签
    await productPage.click('[data-anchor="#comment"]');
    
    // 等待评价内容加载
    await productPage.waitForSelector('.comment-item', { timeout: 10000 });
    console.log('✅ 评价内容加载完成');

    // 筛选带图片的评价
    await productPage.waitForSelector('.filter-item', { timeout: 5000 });
    const picFilter = await productPage.$('.filter-item[datasku*="pic"]');
    if (picFilter) {
      console.log('🖼️ 正在筛选带图评价...');
      await picFilter.click();
      await productPage.waitForTimeout(2000); // 等待筛选结果
    }

    // 获取评价图片信息
    const imageData = await productPage.evaluate(() => {
      const comments = document.querySelectorAll('.comment-item');
      const results: any[] = [];

      comments.forEach((comment, index) => {
        const images = comment.querySelectorAll('.pic-list img');
        if (images.length > 0) {
          const commentText = comment.querySelector('.comment-con')?.textContent?.trim() || '';
          const imageUrls = Array.from(images).map(img => {
            // 获取高清大图URL
            const thumbUrl = img.getAttribute('src') || '';
            return thumbUrl.replace(/n0\//, 'shaidan/'); // 尝试获取大图
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

    // 截图保存结果
    await productPage.screenshot({ path: 'jd_product_puppeteer.png', fullPage: true });
    console.log('📸 已保存截图: jd_product_puppeteer.png');

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
runJdScraperWithPuppeteer();
