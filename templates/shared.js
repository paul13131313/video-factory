// ===== 共通アニメーション関数 =====
// 全AIテンプレートで使う基本関数群

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 入力欄に1文字ずつタイピング
async function typeIntoInput(inputEl, sendBtnEl, text, charDelay) {
  inputEl.value = '';
  sendBtnEl.classList.remove('active');
  for (let i = 0; i < text.length; i++) {
    inputEl.value += text[i];
    if (inputEl.value.length > 0) {
      sendBtnEl.classList.add('active');
    }
    await sleep(charDelay);
  }
}

// ユーザーメッセージをバブルとして表示
function createUserBubble(chatArea, anchorEl, text, bubbleClass, rowClass) {
  const row = document.createElement('div');
  row.className = rowClass || 'msg-user';
  const bubble = document.createElement('div');
  bubble.className = bubbleClass || 'msg-user-bubble';
  bubble.textContent = text;
  row.appendChild(bubble);
  chatArea.insertBefore(row, anchorEl);
  return row;
}

// 入力欄をクリアしてメッセージバブルを表示
async function sendUserBubble(inputEl, sendBtnEl, chatArea, anchorEl, text, options) {
  const opts = options || {};
  inputEl.value = '';
  sendBtnEl.classList.remove('active');

  const row = createUserBubble(chatArea, anchorEl, text, opts.bubbleClass, opts.rowClass);
  await sleep(50);
  row.classList.add('visible');
  scrollToBottom(chatArea);
}

// タイピングインジケーターの表示/非表示
function showIndicator(indicatorEl) {
  indicatorEl.classList.add('visible');
}

function hideIndicator(indicatorEl) {
  indicatorEl.classList.remove('visible');
}

// テキストを1文字ずつストリーミング表示
async function streamText(textEl, chatArea, text, charDelay) {
  for (let i = 0; i < text.length; i++) {
    textEl.textContent += text[i];
    scrollToBottom(chatArea);
    await sleep(charDelay);
  }
}

// チャットエリアを一番下までスクロール
function scrollToBottom(chatArea) {
  chatArea.scrollTop = chatArea.scrollHeight;
}

// アーティファクトカードのHTML生成（Claude用）
function createArtifactCardHTML(title, type) {
  return `
    <div class="artifact-card-icon">
      <svg viewBox="0 0 24 24" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    </div>
    <div class="artifact-card-info">
      <div class="artifact-card-title">${title}</div>
      <div class="artifact-card-type">${type || 'Webサイト'}</div>
    </div>
    <svg class="artifact-card-arrow" viewBox="0 0 24 24" stroke-width="1.5">
      <path d="M7 17L17 7M17 7H7M17 7v10"/>
    </svg>
  `;
}

// 会話アニメーションのメインオーケストレーター
async function runConversation(conversation, timing, callbacks) {
  await sleep(timing.startPause);

  for (let i = 0; i < conversation.length; i++) {
    const msg = conversation[i];

    if (msg.role === 'user') {
      // ユーザータイピング
      await callbacks.onUserType(msg.text, timing.userTypePerChar);
      await sleep(timing.preSendPause);
      // 送信
      await callbacks.onUserSend(msg.text);
      await sleep(timing.postSendPause);

    } else if (msg.role === 'assistant') {
      // タイピングインジケーター
      await callbacks.onAssistantIndicator(timing.assistIndicator);
      // ストリーミング表示
      await callbacks.onAssistantStream(msg.text, timing.assistTypePerChar);
      await sleep(timing.postAssistPause);

      // アーティファクトがある場合
      if (msg.artifact) {
        await callbacks.onArtifactCard(msg.artifact, timing);
        // Puppeteer側にアーティファクト情報を通知して待機
        window.__ARTIFACT_PENDING = msg.artifact;
        window.__WAITING_FOR_ARTIFACT = true;
        // Puppeteerが処理するまで待つ
        while (window.__WAITING_FOR_ARTIFACT) {
          await sleep(100);
        }
      }
    }
  }

  // アーティファクトがない場合のみendPause
  const hasArtifact = conversation.some(m => m.artifact);
  if (!hasArtifact) {
    await sleep(timing.endPause);
  }

  window.__ANIMATION_DONE = true;
}
