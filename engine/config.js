// AI別設定オブジェクト
// タイミング値はそのまま使われる（速度倍率なし）
const AI_CONFIGS = {
  claude: {
    name: 'Claude',
    template: 'claude.html',
    viewport: { width: 390, height: 844 },
    timing: {
      userTypePerChar: 35,      // ユーザー入力: 1文字35ms
      preSendPause: 300,        // 送信前の間
      postSendPause: 500,       // 送信後 → AI表示までの間
      assistIndicator: 600,     // 「考え中...」表示時間
      assistTypePerChar: 15,    // AI返答ストリーミング: 1文字15ms
      postAssistPause: 600,     // AI返答後の間
      startPause: 500,          // 動画開始時の間
      endPause: 1200,           // 動画終了時の間
    },
    artifact: {
      cardPause: 1200,          // アーティファクトカード表示後の間（長めに）
      transition: 500,
      loadWait: 1200,
      scrollDuration: 4000,
      endPause: 1200,
    },
    artifactTypes: ['website'],
  },

  chatgpt: {
    name: 'ChatGPT',
    template: 'chatgpt.html',
    viewport: { width: 390, height: 844 },
    timing: {
      userTypePerChar: 35,
      preSendPause: 300,
      postSendPause: 500,
      assistIndicator: 600,
      assistTypePerChar: 15,
      postAssistPause: 600,
      startPause: 500,
      endPause: 1200,
    },
    artifact: {
      cardPause: 800,
      transition: 500,
      loadWait: 1500,
      scrollDuration: 4000,
      endPause: 1200,
      imageLoadDelay: 1500,
      imageRevealDuration: 600,
    },
    artifactTypes: ['image', 'website'],
  },

  line: {
    name: 'LINE',
    template: 'line.html',
    viewport: { width: 390, height: 844 },
    timing: {
      userTypePerChar: 35,
      preSendPause: 300,
      postSendPause: 500,
      assistIndicator: 500,
      assistTypePerChar: 0,     // LINEは即時表示
      postAssistPause: 600,
      startPause: 500,
      endPause: 1200,
    },
    artifact: {
      cardPause: 0,
      transition: 0,
      loadWait: 0,
      scrollDuration: 0,
      endPause: 0,
    },
    artifactTypes: ['image'],
  },
};

// タイミングオブジェクトを生成（ベース値をそのまま使う）
function calculateTiming(conversation, aiConfig) {
  const t = aiConfig.timing;

  return {
    userTypePerChar: t.userTypePerChar,
    preSendPause: t.preSendPause,
    postSendPause: t.postSendPause,
    assistIndicator: t.assistIndicator,
    assistTypePerChar: t.assistTypePerChar,
    postAssistPause: t.postAssistPause,
    startPause: t.startPause,
    endPause: t.endPause,
    // アーティファクト関連
    artifactCardPause: aiConfig.artifact.cardPause,
    artifactTransition: aiConfig.artifact.transition,
    artifactLoadWait: aiConfig.artifact.loadWait,
    artifactScrollDuration: aiConfig.artifact.scrollDuration,
    artifactEndPause: aiConfig.artifact.endPause,
  };
}

module.exports = { AI_CONFIGS, calculateTiming };
