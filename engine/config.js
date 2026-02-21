// AI別設定オブジェクト
const AI_CONFIGS = {
  claude: {
    name: 'Claude',
    template: 'claude.html',
    viewport: { width: 390, height: 844 },
    timing: {
      userTypePerChar: 50,
      preSendPause: 300,
      postSendPause: 500,
      assistIndicator: 800,
      assistTypePerChar: 20,
      postAssistPause: 800,
      startPause: 500,
      endPause: 1500,
    },
    artifact: {
      cardPause: 1000,
      transition: 500,
      loadWait: 1500,
      scrollDuration: 5000,
      endPause: 1500,
    },
    artifactTypes: ['website'],
  },

  chatgpt: {
    name: 'ChatGPT',
    template: 'chatgpt.html',
    viewport: { width: 390, height: 844 },
    timing: {
      userTypePerChar: 45,
      preSendPause: 250,
      postSendPause: 400,
      assistIndicator: 600,
      assistTypePerChar: 15,
      postAssistPause: 600,
      startPause: 500,
      endPause: 1500,
    },
    artifact: {
      cardPause: 1000,
      transition: 500,
      loadWait: 2000,
      scrollDuration: 5000,
      endPause: 1500,
      imageLoadDelay: 2000,
      imageRevealDuration: 800,
    },
    artifactTypes: ['image', 'website'],
  },

  line: {
    name: 'LINE',
    template: 'line.html',
    viewport: { width: 390, height: 844 },
    timing: {
      userTypePerChar: 50,
      preSendPause: 300,
      postSendPause: 600,
      assistIndicator: 500,
      assistTypePerChar: 0,
      postAssistPause: 800,
      startPause: 500,
      endPause: 1500,
    },
    artifact: {
      cardPause: 0,
      transition: 0,
      loadWait: 0,
      scrollDuration: 0,
      endPause: 0,
    },
    artifactTypes: [],
  },
};

// ベースのアニメーション時間を計算（速度倍率の算出用）
function calculateBaseAnimationTime(conversation, baseTiming) {
  let totalMs = baseTiming.startPause;
  for (const msg of conversation) {
    if (msg.role === 'user') {
      totalMs += msg.text.length * baseTiming.userTypePerChar
        + baseTiming.preSendPause + 50 + baseTiming.postSendPause;
    } else {
      totalMs += baseTiming.assistIndicator
        + msg.text.length * baseTiming.assistTypePerChar
        + baseTiming.postAssistPause;
    }
  }
  totalMs += baseTiming.endPause;
  return totalMs / 1000;
}

// 速度倍率を適用したタイミングを生成
function calculateTiming(conversation, aiConfig, targetDuration) {
  const baseTiming = aiConfig.timing;
  const baseTime = calculateBaseAnimationTime(conversation, baseTiming);
  const speedMultiplier = baseTime / targetDuration;

  return {
    userTypePerChar: baseTiming.userTypePerChar / speedMultiplier,
    preSendPause: baseTiming.preSendPause / speedMultiplier,
    postSendPause: baseTiming.postSendPause / speedMultiplier,
    assistIndicator: baseTiming.assistIndicator / speedMultiplier,
    assistTypePerChar: baseTiming.assistTypePerChar / speedMultiplier,
    postAssistPause: baseTiming.postAssistPause / speedMultiplier,
    startPause: baseTiming.startPause / speedMultiplier,
    endPause: baseTiming.endPause / speedMultiplier,
    // アーティファクト関連は固定（速度倍率の対象外）
    artifactCardPause: aiConfig.artifact.cardPause,
    artifactTransition: aiConfig.artifact.transition,
    artifactLoadWait: aiConfig.artifact.loadWait,
    artifactScrollDuration: aiConfig.artifact.scrollDuration,
    artifactEndPause: aiConfig.artifact.endPause,
    // メタ情報
    speedMultiplier,
    baseTime,
    targetDuration,
  };
}

module.exports = { AI_CONFIGS, calculateTiming, calculateBaseAnimationTime };
