import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

// -------------------------- 配置 --------------------------
const BASE_LIST_URL = '';
const MAX_PAGE = 100;                           // 从 100 开始倒序
const MIN_PAGE = 1;                             // 到 1 开始截止
const TRY_COUNT = 3;                            // 单篇帖子最大重试次数
const DOWNLOAD_DIR = path.resolve('downloads'); // 本地下载目录
const KEYWORDS = ['丝', '学'];                   // 例如 ['你', '我']，空数组 = 不过滤

// 随机人类延迟（2~5 秒）
const randomHumanDelay = () => 2000 + Math.random() * 3000;

// 创建下载目录（若不存在）
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// -------------------------- 辅助函数 --------------------------

/**
 * 检测当前页面是否是登录/错误页面
 */
async function isLoginOrErrorPage(page) {
  const url = page.url();
  if (/login|signin|auth|passport/i.test(url)) return true;
  const text = await page.content();
  if (/登录后才能查看|请先登录|登录才能浏览|验证码|访问受限|错误|页面不存在/i.test(text)) {
    return true;
  }
  const loginForm = await page.$('input[name="username"], input[name="email"], form#login');
  return !!loginForm;
}

/**
 * 从列表页抽取标题 + 绝对链接（只在浏览器内部执行）
 */
async function extractTableRows(page) {
  await page.waitForSelector('#ajaxtable', { timeout: 15000 });

  const rows = await page.$$eval(
    '#ajaxtable tr',
    (trs, base) => {
      const out = [];
      for (const tr of trs.slice(1)) { // 第一个 tr 为表头，跳过
        const a = tr.querySelector('a[href^="/htm_data/"]');
        if (!a) continue;
        const title = a.textContent.trim();
        const href = a.getAttribute('href');
        const fullUrl = new URL(href, base).href;
        out.push({ title, url: fullUrl });
      }
      return out;
    },
    page.url() // 作为 base 传进去，构造绝对 URL
  );

  return rows;
}

/**
 * 在帖子页面获取 rmdown 下载链接（形如 http://rmdown.com/link.php?hash=…）
 */
async function getRmdownLink(page) {
  await page.waitForSelector('#conttpc', { timeout: 15000 });
  const aHandle = await page.locator('#conttpc a[href*="rmdown.com/link.php"]').first();
  if (await aHandle.count() === 0) return null;
  const href = await aHandle.getAttribute('href');
  return new URL(href, page.url()).href; // 处理可能的相对链接
}

/**
 * 打开 rmdown 页面并点击下载按钮，返回下载对象
 */
async function downloadFromRmdown(page, rmUrl) {
  await page.goto(rmUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (await isLoginOrErrorPage(page)) {
    throw new Error('RMDOWN 页面被重定向到登录/错误页');
  }

  // 等待 DOWNLOAD 按钮出现
  const dlBtn = page.locator('button', { hasText: /DOWNLOAD/i });
  await dlBtn.waitFor({ timeout: 15000 });

  // 模拟人类点击前的思考间隔
  await page.waitForTimeout(randomHumanDelay());

  // 同时监听 download 事件并点击按钮
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }), // 最长 2 分钟
    dlBtn.click(),
  ]);

  // 保存文件到本地目录
  const filePath = path.join(DOWNLOAD_DIR, download.suggestedFilename());
  await download.saveAs(filePath);
  console.log(`✅ 下载完成 → ${filePath}`);
}

/**
 * 处理单篇帖子：打开 → 找 rmdown → 进入 rmdown → 点击 DOWNLOAD
 * 整个流程最多 3 次重试，三次仍失败则放弃该帖。
 */
async function processPost(page, post) {
  for (let attempt = 1; attempt <= TRY_COUNT; ++attempt) {
    try {
      console.log(`\n▶️ 开始处理 (尝试 #${attempt}) → ${post.title}\n   ${post.url}`);

      // ① 打开帖子页面
      await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (await isLoginOrErrorPage(page)) {
        throw new Error('帖子页面被重定向到登录/错误页');
      }

      // ② 随机等待 2~5 秒（模拟人类阅读）
      await page.waitForTimeout(randomHumanDelay());

      // ③ 取得 rmdown 下载链接
      const rmLink = await getRmdownLink(page);
      if (!rmLink) {
        throw new Error('未在帖子页面找到 rmdown 下载链接');
      }
      console.log(`   → rmdown 链接: ${rmLink}`);

      // ④ 进入 rmdown 并完成下载
      await downloadFromRmdown(page, rmLink);

      // 成功后直接退出重试循环
      break;
    } catch (err) {
      console.warn(`⚠️ 第 ${attempt} 次处理失败: ${err.message}`);
      if (attempt === 3) {
        console.warn('❌ 已达到最大重试次数，跳过此帖。');
      } else {
        console.log('🔄 正在进行下一次重试 …');
        // 等待一下再重试（同样 2~5 秒的随机间隔）
        await page.waitForTimeout(randomHumanDelay());
      }
    }
  }
}

// -------------------------- 主流程 --------------------------
(async () => {
  const browser = await chromium.launch({
    headless: true,                // 如需观察过程改为 false
    // 如需代理可在这里添加： proxy: { server: 'http://127.0.0.1:1080' },
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // 从第 100 页倒序遍历
  for (let curPage = MAX_PAGE; curPage >= MIN_PAGE; curPage--) {
    const listUrl = `${BASE_LIST_URL}${curPage}`;
    console.log(`\n=== 正在抓取列表页 ${curPage} ===\n${listUrl}`);

    try {
      const resp = await page.goto(listUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const status = resp?.status();
      if (!status || status < 200 || status >= 300) {
        console.warn(`⚠️ 列表页返回异常状态码 ${status}，终止后续抓取`);
        break;
      }

      if (await isLoginOrErrorPage(page)) {
        console.warn('⚠️ 列表页被重定向到登录/错误页面，终止抓取');
        break;
      }

      // 抽取该页所有帖子（已完成标题/URL 解析）
      const posts = await extractTableRows(page);
      console.log(`   → 本页共 ${posts.length} 条记录`);

      // 关键词过滤（若 KEYWORDS 为空则不过滤）
      const filteredPosts = posts.filter(item => {
        if (!KEYWORDS.length) return true;
        const lowerTitle = item.title.toLowerCase();
        return KEYWORDS.some(k => lowerTitle.includes(k.toLowerCase()));
      });

      console.log(`   → 符合关键词的 ${filteredPosts.length} 条`);

      // 逐帖处理（每处理完一条才继续下一条）
      for (const post of filteredPosts) {
        await processPost(page, post);
        // 在两篇帖子之间也加入一次随机“思考”间隔
        await page.waitForTimeout(randomHumanDelay());
      }
    } catch (err) {
      console.error(`❌ 抓取第 ${curPage} 页时出错: ${err.message}`);
      console.warn('已停止后续列表抓取');
      break;
    }
  }

  console.log('\n=== 所有任务已完成 ===');
  await browser.close();
  process.exit(0);
})();