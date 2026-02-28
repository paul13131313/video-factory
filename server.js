const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { startRecording } = require('./engine/recorder');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;
const CONVERSATIONS_DIR = path.join(__dirname, 'conversations');
const OUTPUT_DIR = path.join(__dirname, 'output');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// uploadsディレクトリを作成
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ミドルウェア
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ジョブ管理（メモリ内）
const jobs = new Map();
let isRecording = false;
const jobQueue = [];

// WebSocket: 全クライアントにブロードキャスト
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ===== API: 動画生成 =====
app.post('/api/generate', (req, res) => {
  const { aiType, conversation, settings } = req.body;

  if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
    return res.status(400).json({ error: '会話データが必要です' });
  }

  if (!aiType) {
    return res.status(400).json({ error: 'AIタイプを指定してください' });
  }

  const jobId = Date.now().toString();
  jobs.set(jobId, { status: 'queued', progress: 0, createdAt: new Date() });
  res.json({ jobId });

  // キューに追加
  jobQueue.push({ jobId, aiType, conversation, settings });
  processQueue();
});

// キュー処理（同時に1つだけ実行）
async function processQueue() {
  if (isRecording || jobQueue.length === 0) return;

  isRecording = true;
  const job = jobQueue.shift();

  await startRecording({
    jobId: job.jobId,
    aiType: job.aiType,
    conversation: job.conversation,
    settings: job.settings,

    onProgress: (stage, progress, message) => {
      jobs.set(job.jobId, { status: 'processing', stage, progress, message });
      broadcast({ jobId: job.jobId, stage, progress, message });
    },

    onComplete: (outputPath, duration) => {
      jobs.set(job.jobId, { status: 'done', outputPath, duration });
      broadcast({ jobId: job.jobId, stage: 'done', progress: 100, duration });
      console.log(`[完了] ${job.jobId}: ${duration.toFixed(1)}秒`);
      isRecording = false;
      processQueue();
    },

    onError: (error) => {
      jobs.set(job.jobId, { status: 'error', error: error.message });
      broadcast({ jobId: job.jobId, stage: 'error', message: error.message });
      console.error(`[エラー] ${job.jobId}: ${error.message}`);
      isRecording = false;
      processQueue();
    },
  });
}

// ===== API: ジョブステータス =====
app.get('/api/jobs/:id/status', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'ジョブが見つかりません' });
  }
  res.json(job);
});

// ===== API: 動画ダウンロード =====
app.get('/api/jobs/:id/download', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'done') {
    return res.status(404).json({ error: '動画が見つかりません' });
  }
  res.download(job.outputPath, `video_${req.params.id}.mp4`);
});

// ===== API: 画像アップロード =====
app.post('/api/upload', express.raw({ type: 'image/*', limit: '10mb' }), (req, res) => {
  const ext = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  }[req.headers['content-type']] || '.png';

  const filename = `${Date.now()}${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, req.body);
  res.json({ url: `/uploads/${filename}`, filename });
});

// ===== API: 保存された会話の一覧 =====
app.get('/api/conversations', (req, res) => {
  try {
    const files = fs.readdirSync(CONVERSATIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: `/api/conversations/${f}`,
      }));
    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

// ===== API: 保存された会話の取得 =====
app.get('/api/conversations/:name', (req, res) => {
  const filePath = path.join(CONVERSATIONS_DIR, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'ファイルが見つかりません' });
  }
  res.sendFile(filePath);
});

// ===== API: 会話の保存 =====
app.post('/api/conversations', (req, res) => {
  const { name, data } = req.body;
  if (!name || !data) {
    return res.status(400).json({ error: 'name と data が必要です' });
  }
  const filePath = path.join(CONVERSATIONS_DIR, name.endsWith('.json') ? name : `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true, path: filePath });
});

// サーバー起動
server.listen(PORT, () => {
  console.log(`Video Factory 起動: http://localhost:${PORT}`);
  console.log(`出力先: ${OUTPUT_DIR}`);
});
