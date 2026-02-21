const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { AI_CONFIGS, calculateTiming } = require('./config');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// 録画ジョブの実行
async function startRecording({ jobId, aiType, conversation, settings, onProgress, onComplete, onError }) {
  let browser = null;

  try {
    const aiConfig = AI_CONFIGS[aiType];
    if (!aiConfig) {
      throw new Error(`未対応のAIタイプ: ${aiType}`);
    }

    const timing = calculateTiming(conversation, aiConfig);

    const t0 = Date.now();
    const lap = (label) => console.log(`[${jobId}] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    onProgress('init', 5, 'ブラウザ起動中...');
    lap('開始');

    const launchOptions = {
      headless: true,
      args: [
        `--window-size=${aiConfig.viewport.width},${aiConfig.viewport.height}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOptions);
    lap('ブラウザ起動');

    const page = await browser.newPage();
    await page.setViewport({
      width: aiConfig.viewport.width,
      height: aiConfig.viewport.height,
      deviceScaleFactor: 2,
    });

    // テンプレート読み込み
    onProgress('loading', 10, 'テンプレート読み込み中...');
    const templatePath = path.join(TEMPLATES_DIR, aiConfig.template);
    await page.goto(`file://${templatePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__CHAT_READY === true, { timeout: 10000 });
    lap('テンプレート準備完了');

    // 録画開始
    onProgress('recording', 20, '録画開始...');
    const webmPath = path.join(OUTPUT_DIR, `${jobId}.webm`);
    const recorder = await page.screencast({ path: webmPath });
    lap('録画開始');

    // ローカルパスをfile://に変換するヘルパー
    const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
    const PUBLIC_DIR = path.join(__dirname, '..', 'public');
    function toFileUrl(url) {
      if (url.startsWith('/uploads/')) {
        return `file://${path.join(UPLOADS_DIR, url.replace('/uploads/', ''))}`;
      }
      if (url.startsWith('/samples/')) {
        return `file://${path.join(PUBLIC_DIR, url.slice(1))}`;
      }
      return url;
    }

    // アーティファクトの相対パスを絶対パスに変換
    const processedConversation = conversation.map(msg => {
      if (msg.artifact && msg.artifact.url) {
        const converted = toFileUrl(msg.artifact.url);
        if (converted !== msg.artifact.url) {
          return {
            ...msg,
            artifact: { ...msg.artifact, url: converted },
          };
        }
      }
      return msg;
    });

    // settings内の画像パスも変換
    const processedSettings = { ...(settings || {}) };
    if (processedSettings.lineAvatar) {
      processedSettings.lineAvatar = toFileUrl(processedSettings.lineAvatar);
    }

    // テンプレート側でアニメーション開始
    onProgress('animating', 30, 'アニメーション実行中...');
    page.evaluate((conv, tim, sett) => {
      window.__START_ANIMATION(conv, tim, sett);
    }, processedConversation, timing, processedSettings);

    // アニメーション完了 or アーティファクト待ちをポーリング
    let animationDone = false;
    while (!animationDone) {
      await sleep(200);

      // アーティファクト待ちか確認
      const waitingForArtifact = await page.evaluate(() => window.__WAITING_FOR_ARTIFACT === true);
      if (waitingForArtifact) {
        const artifact = await page.evaluate(() => window.__ARTIFACT_PENDING);
        console.log(`[${jobId}] アーティファクト処理: ${artifact.type || 'website'} - ${artifact.title}`);

        if (artifact.type === 'image') {
          // 画像アーティファクト: テンプレート内で画像表示（ページ遷移なし）
          onProgress('artifact', 50, `画像生成中: ${artifact.title}`);
          // テンプレート側のアニメーション続行を許可
          await page.evaluate(() => { window.__WAITING_FOR_ARTIFACT = false; });
          // 画像表示アニメーション完了を待つ（__ANIMATION_DONEで検知）
        } else {
          // Webサイトアーティファクト: ページ遷移 + スクロール
          onProgress('artifact', 50, `サイト読み込み中: ${artifact.title}`);

          await page.goto(artifact.url, { waitUntil: 'networkidle0', timeout: 30000 });
          await sleep(timing.artifactLoadWait);

          // 画像の読み込みを待つ
          await page.evaluate(async () => {
            await new Promise(r => setTimeout(r, 1000));
            const images = document.querySelectorAll('img');
            await Promise.all([...images].map(img => {
              if (img.complete) return Promise.resolve();
              return new Promise(r => { img.onload = r; img.onerror = r; });
            }));
          });

          // 自動スクロール
          onProgress('scrolling', 60, 'スクロール中...');
          const scrollHeight = await page.evaluate(() => {
            return Math.max(
              document.body.scrollHeight,
              document.documentElement.scrollHeight
            ) - window.innerHeight;
          });

          if (scrollHeight > 0) {
            const duration = Math.max(3000, Math.min(timing.artifactScrollDuration, scrollHeight * 5));
            const totalSteps = Math.ceil(scrollHeight);
            const delayPerStep = duration / totalSteps;

            console.log(`[${jobId}] スクロール: ${scrollHeight}px, ${(duration / 1000).toFixed(1)}秒`);

            await page.evaluate(async (totalScroll, delay) => {
              let pos = 0;
              while (pos < totalScroll) {
                pos = Math.min(pos + 1, totalScroll);
                window.scrollTo(0, pos);
                await new Promise(r => setTimeout(r, delay));
              }
            }, scrollHeight, delayPerStep);
          }

          await sleep(timing.artifactEndPause);

          // Webサイトアーティファクトは録画終了
          animationDone = true;
        }
      }

      // 通常のアニメーション完了チェック
      const done = await page.evaluate(() => window.__ANIMATION_DONE === true).catch(() => false);
      if (done) {
        animationDone = true;
      }
    }

    // 録画停止
    onProgress('stopping', 75, '録画停止中...');
    await recorder.stop();
    lap('録画停止');

    await browser.close();
    browser = null;
    lap('ブラウザ終了');

    // WebM → MP4 変換
    onProgress('converting', 80, 'MP4変換中...');
    const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
    execSync(
      `ffmpeg -y -i "${webmPath}" -c:v libx264 -preset ultrafast -crf 20 -pix_fmt yuv420p -r 30 -an "${outputPath}"`,
      { stdio: 'pipe' }
    );

    // 動画の長さ確認
    const durationStr = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`
    ).toString().trim();
    const duration = parseFloat(durationStr);
    lap(`完了 (${duration.toFixed(1)}秒動画)`);

    // 中間ファイル削除
    fs.unlinkSync(webmPath);

    notify('Video Factory', `動画完成 (${duration.toFixed(1)}秒)`);
    onComplete(outputPath, duration);
  } catch (err) {
    console.error(`[${jobId}] エラー:`, err);
    if (browser) {
      await browser.close().catch(() => {});
    }
    notify('Video Factory', `エラー: ${err.message}`);
    onError(err);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// macOS通知を送信
function notify(title, message) {
  try {
    const escaped = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${escaped}" with title "${title}" sound name "Glass"'`);
  } catch (e) {
    // 通知失敗は無視
  }
}

module.exports = { startRecording };
