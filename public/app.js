// ===== DOM要素 =====
const targetDurationSlider = document.getElementById('targetDuration');
const durationValue = document.getElementById('durationValue');
const messageList = document.getElementById('messageList');
const conversationJson = document.getElementById('conversationJson');
const jsonError = document.getElementById('jsonError');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const toggleJsonBtn = document.getElementById('toggleJsonBtn');
const applyJsonBtn = document.getElementById('applyJsonBtn');
const editorView = document.getElementById('editorView');
const jsonView = document.getElementById('jsonView');
const addMessageBtn = document.getElementById('addMessageBtn');
const generateBtn = document.getElementById('generateBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressMessage = document.getElementById('progressMessage');
const downloadLink = document.getElementById('downloadLink');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');

// LINE設定
const lineSettings = document.getElementById('lineSettings');
const lineNameInput = document.getElementById('lineName');
const lineAvatarPreview = document.getElementById('lineAvatarPreview');
const lineAvatarBtn = document.getElementById('lineAvatarBtn');
const lineAvatarClear = document.getElementById('lineAvatarClear');
let lineAvatarUrl = '';

let currentJobId = null;
let ws = null;

// ===== 会話データ =====
let messages = [];

// ===== 初期化 =====

// AI切替時のLINE設定パネル表示/非表示
document.querySelectorAll('input[name="aiType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    lineSettings.style.display = radio.value === 'line' ? 'flex' : 'none';
    renderMessages();
  });
});

// LINEアイコンアップロード
lineAvatarBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const result = await res.json();
      lineAvatarUrl = result.url;
      lineAvatarPreview.src = result.url;
      lineAvatarPreview.style.display = 'block';
      lineAvatarClear.style.display = 'inline-block';
    } catch (err) {
      jsonError.textContent = `アップロード失敗: ${err.message}`;
    }
  });
  input.click();
});

lineAvatarClear.addEventListener('click', () => {
  lineAvatarUrl = '';
  lineAvatarPreview.style.display = 'none';
  lineAvatarClear.style.display = 'none';
});

// スライダー
targetDurationSlider.addEventListener('input', () => {
  durationValue.textContent = `${targetDurationSlider.value}秒`;
});

// サンプル読み込み（AIタイプ別）
loadSampleBtn.addEventListener('click', async () => {
  try {
    const aiType = getSelectedAiType();
    const sampleMap = {
      claude: 'sample_claude.json',
      chatgpt: 'sample_chatgpt.json',
      line: 'sample_line.json',
    };
    const filename = sampleMap[aiType] || 'sample_conversation.json';
    const res = await fetch(`/api/conversations/${filename}`);
    const data = await res.json();

    // LINE形式: { settings, conversation } or 配列
    if (Array.isArray(data)) {
      messages = data;
    } else {
      messages = data.conversation || [];
      // LINE設定を反映
      if (data.settings) {
        if (data.settings.lineName) {
          lineNameInput.value = data.settings.lineName;
        }
        if (data.settings.lineAvatar) {
          lineAvatarUrl = data.settings.lineAvatar;
          lineAvatarPreview.src = data.settings.lineAvatar;
          lineAvatarPreview.style.display = 'block';
          lineAvatarClear.style.display = 'inline-block';
        }
      }
    }

    renderMessages();
    syncJsonView();
    jsonError.textContent = '';
  } catch (err) {
    jsonError.textContent = 'サンプルの読み込みに失敗しました';
  }
});

// JSON表示トグル
let jsonVisible = false;
toggleJsonBtn.addEventListener('click', () => {
  jsonVisible = !jsonVisible;
  if (jsonVisible) {
    syncJsonView();
    jsonView.style.display = 'block';
    toggleJsonBtn.textContent = 'エディタ表示';
  } else {
    jsonView.style.display = 'none';
    toggleJsonBtn.textContent = 'JSON表示';
  }
});

// JSONから反映
applyJsonBtn.addEventListener('click', () => {
  try {
    const data = JSON.parse(conversationJson.value);
    const conv = Array.isArray(data) ? data : data.conversation;
    if (!Array.isArray(conv)) throw new Error('配列が必要です');
    messages = conv;
    renderMessages();
    jsonError.textContent = '';
  } catch (e) {
    jsonError.textContent = `JSON形式エラー: ${e.message}`;
  }
});

// メッセージ追加（自動交互）
addMessageBtn.addEventListener('click', () => {
  addNextMessage();
});

function addNextMessage() {
  const lastRole = messages.length > 0 ? messages[messages.length - 1].role : null;
  const nextRole = lastRole === 'user' ? 'assistant' : 'user';
  messages.push({ role: nextRole, text: '' });
  renderMessages();
  focusLastMessage();
}

// ===== メッセージリスト描画 =====
function renderMessages() {
  messageList.innerHTML = '';

  messages.forEach((msg, index) => {
    const item = document.createElement('div');
    item.className = `msg-item msg-item-${msg.role}`;
    item.dataset.index = index;

    // ヘッダー
    const header = document.createElement('div');
    header.className = 'msg-item-header';

    const role = document.createElement('span');
    role.className = 'msg-item-role';
    role.textContent = msg.role === 'user' ? 'User' : 'Assistant';

    const actions = document.createElement('div');
    actions.className = 'msg-item-actions';

    // 上下移動ボタン
    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.textContent = '↑';
      upBtn.title = '上に移動';
      upBtn.addEventListener('click', () => moveMessage(index, -1));
      actions.appendChild(upBtn);
    }
    if (index < messages.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.textContent = '↓';
      downBtn.title = '下に移動';
      downBtn.addEventListener('click', () => moveMessage(index, 1));
      actions.appendChild(downBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', () => deleteMessage(index));
    actions.appendChild(deleteBtn);

    header.appendChild(role);
    header.appendChild(actions);
    item.appendChild(header);

    // テキスト入力
    const body = document.createElement('div');
    body.className = 'msg-item-body';

    const textarea = document.createElement('textarea');
    textarea.className = 'msg-item-text';
    textarea.placeholder = msg.role === 'user' ? 'ユーザーのメッセージ...' : 'アシスタントの返答...';
    textarea.value = msg.text || '';
    textarea.addEventListener('input', (e) => {
      messages[index].text = e.target.value;
      autoResize(e.target);
      syncJsonView();
    });
    // Shift+Enterで次のメッセージ欄を自動追加してフォーカス移動
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        if (index === messages.length - 1) {
          addNextMessage();
        } else {
          const nextTextarea = messageList.querySelectorAll('.msg-item-text')[index + 1];
          if (nextTextarea) nextTextarea.focus();
        }
      }
    });

    body.appendChild(textarea);
    item.appendChild(body);

    // アシスタントの場合: アーティファクト設定
    if (msg.role === 'assistant') {
      const aiType = getSelectedAiType();
      const hasArtifact = !!msg.artifact;
      const artifactType = getArtifactTypeForAi(aiType);

      // LINEにはアーティファクトなし（テキストのみ）... と思ったが画像対応
      // Claude → website, ChatGPT → image, LINE → image
      if (artifactType) {
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'artifact-toggle';
        const toggleBtn = document.createElement('button');
        const toggleLabel = artifactType === 'image'
          ? (hasArtifact ? '🖼 画像設定済み' : '+ 画像を追加')
          : (hasArtifact ? '🔗 サイト設定済み' : '+ サイトを追加');
        toggleBtn.className = 'artifact-toggle-btn' + (hasArtifact ? ' active' : '');
        toggleBtn.textContent = toggleLabel;
        toggleBtn.addEventListener('click', () => {
          if (messages[index].artifact) {
            delete messages[index].artifact;
          } else {
            messages[index].artifact = { type: artifactType, title: '', url: '' };
          }
          renderMessages();
          syncJsonView();
        });
        toggleDiv.appendChild(toggleBtn);
        item.appendChild(toggleDiv);

        if (hasArtifact) {
          const fields = document.createElement('div');
          fields.className = 'artifact-fields';

          if (artifactType === 'website') {
            // Claude: タイトル + URL
            const titleField = createArtifactField('タイトル', msg.artifact.title || '', (val) => {
              messages[index].artifact.title = val;
              syncJsonView();
            });
            fields.appendChild(titleField);

            const urlField = createArtifactField('URL', msg.artifact.url || '', (val) => {
              messages[index].artifact.url = val;
              syncJsonView();
            }, 'https://...');
            fields.appendChild(urlField);
          } else {
            // ChatGPT / LINE: 画像アップロード
            const uploadRow = document.createElement('div');
            uploadRow.className = 'artifact-upload';

            if (msg.artifact.url) {
              // プレビュー表示
              const preview = document.createElement('img');
              preview.className = 'artifact-preview';
              preview.src = msg.artifact.url;
              uploadRow.appendChild(preview);

              const changeBtn = document.createElement('button');
              changeBtn.className = 'btn-tool';
              changeBtn.textContent = '画像を変更';
              changeBtn.addEventListener('click', () => {
                triggerImageUpload(index);
              });
              uploadRow.appendChild(changeBtn);
            } else {
              const uploadBtn = document.createElement('button');
              uploadBtn.className = 'artifact-upload-btn';
              uploadBtn.textContent = '画像をアップロード';
              uploadBtn.addEventListener('click', () => {
                triggerImageUpload(index);
              });
              uploadRow.appendChild(uploadBtn);
            }

            fields.appendChild(uploadRow);
          }

          item.appendChild(fields);
        }
      }
    }

    messageList.appendChild(item);
    requestAnimationFrame(() => autoResize(textarea));
  });
}

// ===== AI別アーティファクトタイプ =====
function getSelectedAiType() {
  return document.querySelector('input[name="aiType"]:checked').value;
}

function getArtifactTypeForAi(aiType) {
  if (aiType === 'claude') return 'website';
  if (aiType === 'chatgpt') return 'image';
  if (aiType === 'line') return 'image';
  return null;
}

// ===== 画像アップロード =====
function triggerImageUpload(messageIndex) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const result = await res.json();
      messages[messageIndex].artifact.url = result.url;
      messages[messageIndex].artifact.title = messages[messageIndex].artifact.title || file.name;
      renderMessages();
      syncJsonView();
    } catch (err) {
      jsonError.textContent = `アップロード失敗: ${err.message}`;
    }
  });
  input.click();
}

function createArtifactField(label, value, onChange, placeholder) {
  const row = document.createElement('div');
  row.className = 'artifact-field';

  const lbl = document.createElement('label');
  lbl.textContent = label;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder || 'アーティファクト名';
  input.addEventListener('input', (e) => onChange(e.target.value));

  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function moveMessage(index, direction) {
  const newIndex = index + direction;
  const temp = messages[index];
  messages[index] = messages[newIndex];
  messages[newIndex] = temp;
  renderMessages();
  syncJsonView();
}

function deleteMessage(index) {
  messages.splice(index, 1);
  renderMessages();
  syncJsonView();
}

function focusLastMessage() {
  requestAnimationFrame(() => {
    const textareas = messageList.querySelectorAll('.msg-item-text');
    if (textareas.length > 0) {
      const last = textareas[textareas.length - 1];
      last.focus();
      messageList.scrollTop = messageList.scrollHeight;
    }
  });
}

function syncJsonView() {
  if (conversationJson) {
    conversationJson.value = JSON.stringify(messages, null, 2);
  }
}

// ===== 初期状態: 最初のユーザーメッセージを自動追加 =====
if (messages.length === 0) {
  messages.push({ role: 'user', text: '' });
  renderMessages();
  focusLastMessage();
}

// ===== WebSocket接続 =====
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.jobId !== currentJobId) return;
    handleProgress(data);
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

connectWebSocket();

// ===== 進捗処理 =====
function handleProgress(data) {
  if (data.stage === 'error') {
    showError(data.message);
    generateBtn.disabled = false;
    return;
  }

  if (data.stage === 'done') {
    showDownload(data);
    generateBtn.disabled = false;
    return;
  }

  progressFill.style.width = `${data.progress}%`;
  progressMessage.textContent = data.message || '';
}

// ===== 生成 =====
generateBtn.addEventListener('click', async () => {
  const validMessages = messages.filter(m => m.text && m.text.trim());
  if (validMessages.length === 0) {
    jsonError.textContent = 'メッセージを1つ以上入力してください';
    return;
  }

  const aiType = document.querySelector('input[name="aiType"]:checked').value;
  const targetDuration = parseInt(targetDurationSlider.value);

  const settings = { targetDuration };

  // LINE固有設定
  if (aiType === 'line') {
    settings.lineName = lineNameInput.value || 'AI';
    if (lineAvatarUrl) {
      settings.lineAvatar = lineAvatarUrl;
    }
  }

  generateBtn.disabled = true;
  progressSection.style.display = 'block';
  errorSection.style.display = 'none';
  progressFill.style.width = '0%';
  progressMessage.textContent = '送信中...';
  jsonError.textContent = '';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aiType,
        conversation: validMessages,
        settings,
      }),
    });

    const result = await res.json();
    if (result.error) {
      showError(result.error);
      generateBtn.disabled = false;
      return;
    }

    currentJobId = result.jobId;
    progressMessage.textContent = 'ジョブ開始...';
  } catch (err) {
    showError(err.message);
    generateBtn.disabled = false;
  }
});

// ===== 完成 + 自動ダウンロード =====
function showDownload(data) {
  // プログレスバーを完了表示に
  progressFill.style.width = '100%';
  const durationText = data.duration ? `${data.duration.toFixed(1)}秒` : '';
  progressMessage.textContent = `完成 ${durationText} — ダウンロード中...`;

  downloadLink.href = `/api/jobs/${currentJobId}/download`;
  downloadLink.download = `video_${currentJobId}.mp4`;

  // 自動ダウンロード
  downloadLink.click();
}

// ===== エラー表示 =====
function showError(message) {
  progressSection.style.display = 'none';
  errorSection.style.display = 'block';
  errorMessage.textContent = message;
}
