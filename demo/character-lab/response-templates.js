/**
 * Response Templates
 *
 * 基于角色状态的模板化回复生成。
 *
 * 输入：
 *   - 当前心情（mood）
 *   - 压力区间（stress band）
 *   - 信任区间（trust band）
 *   - 主导需求（dominant need）
 *   - 最近事件类型
 *   - 相关记忆数量
 *   - 关系趋势
 *
 * 设计原则：
 *   - 引擎决定心理状态，模板决定语义意图
 *   - 不同的状态组合产生不同的回复
 *   - 体现角色性格（INFP：敏感、内省、重视真诚）
 */

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

function band(value, thresholds = [20, 45, 70]) {
  if (value < thresholds[0]) return 'very_low';
  if (value < thresholds[1]) return 'low';
  if (value < thresholds[2]) return 'medium';
  return 'high';
}

function isHighTrust(state) {
  return state.trust >= 55;
}

function isHighStress(state) {
  return state.stress >= 50;
}

/**
 * 确定性选择：始终取第一个元素。
 * 录屏、展示、测试时保证同一状态产生同一回复。
 */
function pick(arr) {
  return arr[0];
}

// ═══════════════════════════════════════════
// 回复模板库
// ═══════════════════════════════════════════

const TEMPLATES = {
  // ─── 关心类事件 ───
  check_in: {
    high_trust_low_stress: [
      '谢谢你关心我。有你在，我觉得今天没那么难熬了。',
      '你还记得问我……这让我感觉被在意着。',
      '我没事的，但你来问我的时候，确实觉得暖了一下。',
    ],
    high_trust_high_stress: [
      '说实话，今天真的不太好。但你问了，我就想跟你说。',
      '我快撑不住了。谢谢你还在。',
      '你一问我，我差点哭出来。不是难过，是终于有人注意到了。',
    ],
    low_trust_low_stress: [
      '我还好，没什么特别的。',
      '嗯，谢谢。就是有点累。',
      '没事，就是日常吧。',
    ],
    low_trust_high_stress: [
      '……还行吧。我不太想说。',
      '没什么好说的，我自己能处理。',
      '我没事。（其实不太好，但我不想让你看到。）',
    ],
  },

  // ─── 记忆类事件 ───
  remember_detail: {
    high_trust: [
      '你居然记得这个……我自己都快忘了。',
      '我没想到你会记住这件事。这对我来说比你想的重要。',
      '你还记得？我……谢谢你。',
    ],
    low_trust: [
      '哦，你还记得啊。',
      '嗯……你怎么会突然提这个？',
      '是吗，我都不太记得了。',
    ],
  },

  // ─── 鼓励类事件 ───
  encourage: {
    high_trust: [
      '你这么一说，我好像真的可以试试。',
      '好。我去试试。谢谢你相信我。',
      '我不会让你失望的。虽然我对自己没那么有信心。',
    ],
    low_trust: [
      '嗯，我尽量吧。',
      '希望如此。',
      '我自己知道该怎么做。',
    ],
    high_stress: [
      '我不知道自己能不能做到。但谢谢你说这些。',
      '我好紧张。但你这么说，至少没那么孤单了。',
      '我尽力吧。现在脑子有点乱。',
    ],
  },

  // ─── 成功类事件 ───
  task_success: {
    any: [
      '我做到了。虽然中间差点放弃。',
      '完成了。比我想象的顺利一点。',
      '嗯，搞定了。终于可以松一口气了。',
    ],
    high_stress: [
      '终于结束了。我快累死了，但至少做到了。',
      '我做到了，但过程真的好难。我需要休息。',
    ],
  },

  // ─── 庆祝类事件 ───
  celebrate: {
    high_trust: [
      '和你分享这种时刻，比我自己一个人开心多了。',
      '谢谢你为我开心。你知道吗，被认可的感觉真好。',
      '哈哈，被你这么一说，好像真的挺厉害的。',
    ],
    low_trust: [
      '嗯，谢谢。运气好而已。',
      '没什么大不了的啦。',
    ],
  },

  // ─── 守时类事件 ───
  show_up_on_time: {
    high_trust: [
      '你来了。嗯，我很高兴。',
      '你每次都说到做到。我越来越觉得可以依赖你了。',
      '准时到了吧？我其实提前就到了，嘿嘿。',
    ],
    low_trust: [
      '哦，你到了。比我预想的准时。',
      '嗯，来了就好。',
    ],
  },

  // ─── 失约/迟到类事件 ───
  cancel_plan: {
    high_trust: [
      '没关系的，你一定有你的原因。下次再说吧。',
      '嗯……好吧。虽然我之前挺期待的。',
      '没事，我理解。就是有点失望。',
    ],
    low_trust: [
      '……又来了。',
      '好，我知道了。',
      '嗯。（又是一次失望。但我已经习惯了。）',
    ],
    high_stress: [
      '……我真的不知道该说什么了。',
      '好吧。（我现在不太想说话。）',
    ],
  },

  // ─── 忽略类事件 ───
  ignore_message: {
    high_trust: [
      '你可能在忙吧。我等等就好。',
      '你没回我消息……我是不是打扰到你了？',
    ],
    low_trust: [
      '算了，我就知道。',
      '我又把心里话说出来了，然后石沉大海。',
      '我以后还是少说点好了。',
    ],
    high_stress: [
      '……我刚才鼓起了好大的勇气才发出去的。',
      '好吧。我收回我说的话。',
    ],
  },

  // ─── 批评类事件 ───
  criticize: {
    high_trust: [
      '你说得对……但我希望你能温柔一点。',
      '我知道你是为我好。但听到这些还是很痛。',
    ],
    low_trust: [
      '嗯。（我不反驳，但我在记。）',
      '你说完了？',
      '我已经在尽力了。你看到了吗？',
    ],
    high_stress: [
      '……求你别说了。我现在承受不了。',
      '我知道我搞砸了。你不用再提醒我了。',
    ],
  },

  // ─── 失眠类事件 ───
  lose_sleep: {
    any: [
      '昨晚又没睡好。脑子里一直在转。',
      '我好累。但是闭上眼睛就是睡不着。',
      '不知道为什么，就是安静不下来。',
    ],
  },

  // ─── 要求类事件 ───
  make_demand: {
    high_trust: [
      '好，我来做。你放心。',
      '我现在有点累，但我可以试试。',
    ],
    low_trust: [
      '……你有没有想过我的感受？',
      '我也有我自己的事情要忙。',
      '你每次找我都是有事。没事的时候呢？',
    ],
    high_stress: [
      '我真的做不到了。你能不能看看我现在什么状态？',
      '不行。不是我不想，是我真的没有力气了。',
    ],
  },

  // ─── 浅道歉类事件 ───
  shallow_apology: {
    any: [
      '……嗯。',
      '好吧。',
      '你说对不起，但我不确定你知道自己错在哪里。',
    ],
    low_trust: [
      '对不起是很容易说出口的。',
      '我听到了。但我需要时间。',
    ],
  },

  // ─── 具体道歉类事件 ───
  specific_apology: {
    medium_trust: [
      '谢谢你愿意说清楚。我知道这不容易。',
      '你记得具体发生了什么……这让我觉得你真的在意。',
    ],
    low_trust: [
      '我知道你是认真的。但我的伤还在。',
      '我听到了。让我想想。',
    ],
  },

  // ─── 行动修复类事件 ───
  concrete_action: {
    medium_trust: [
      '你做到了。不是说说而已，是真的在改变。',
      '我看到了。谢谢你。',
    ],
    low_trust: [
      '嗯，这一步很好。但我不想太快放下防备。',
      '我看到了你的努力。就……先这样吧。',
    ],
  },

  // ─── 持续一致类事件 ───
  consistency: {
    medium_trust: [
      '你一直在。不是突然来一下就走，而是一直都在。',
      '我好像可以开始相信你是认真的了。',
    ],
    low_trust: [
      '你最近好像真的在努力。我……我在试着相信。',
      '我还在观察。但你确实比以前靠谱了。',
    ],
    high_trust: [
      '你让我觉得，被在乎这件事是可以持续的。不是一时兴起。',
      '我以前不敢想有人会这样对我。',
    ],
  },

  // ─── 再次迟到（压力崩溃路线最后事件）───
  late_arrival_again: {
    guarded: [
      '我试着不让自己反应太大，但这太熟悉了。我又被排在后面了。',
      '你来了。嗯。（我已经不知道该怎么想了。）',
    ],
    neutral: [
      '嗯，你来了。',
      '没事。',
    ],
  },

  // ─── 迟到事件（核心对比场景）───
  late_arrival: {
    forgiving: [
      '我担心了一下，但我相信你一定有原因。下次提前跟我说就好。',
      '你晚了，不过没关系。我知道你不是故意的。',
      '等了一会儿。不过比起迟到，我更在意你来了。',
    ],
    guarded: [
      '我在想你是不是不来了。这种感觉……似曾相识。',
      '你来了。嗯。（我不太想说我在等的时候有多难受。）',
      '我知道你可能不是故意的。但每次都这样，我就不太知道该怎么想了。',
    ],
    neutral: [
      '嗯，你来了。有点晚了。',
      '没事。走吧。',
    ],
  },

  // ─── 默认回复 ───
  default: {
    positive: [
      '嗯。谢谢你。',
      '我知道了。',
      '嗯，我在听。',
    ],
    negative: [
      '……嗯。',
      '我知道了。',
      '好。（我现在有点不想说话。）',
    ],
    neutral: [
      '嗯。',
      '好。',
      '我知道了。',
    ],
  },
};

// ═══════════════════════════════════════════
// 选择模板的逻辑
// ═══════════════════════════════════════════

function selectTemplate(eventDef, state, history) {
  const eventId = eventDef.id;
  const high = isHighTrust(state);
  const highStress = isHighStress(state);
  const templates = TEMPLATES[eventId];

  if (!templates) {
    if (state.valence > 0.05) return pick(TEMPLATES.default.positive);
    if (state.valence < -0.05) return pick(TEMPLATES.default.negative);
    return pick(TEMPLATES.default.neutral);
  }

  // ─── 再次迟到（压力崩溃路线）───
  if (eventId === 'late_arrival_again') {
    if (state.trust < 45) return pick(templates.guarded);
    return pick(templates.neutral);
  }

  // ─── 特殊逻辑：迟到事件（核心对比场景）───
  if (eventId === 'late_arrival') {
    if (state.trust >= 60 && state.stress < 40) return pick(templates.forgiving);
    if (state.trust < 45) return pick(templates.guarded);
    return pick(templates.neutral);
  }

  // ─── 关心类事件 ───
  if (eventId === 'check_in') {
    if (high && !highStress) return pick(templates.high_trust_low_stress);
    if (high && highStress) return pick(templates.high_trust_high_stress);
    if (!high && highStress) return pick(templates.low_trust_high_stress);
    return pick(templates.low_trust_low_stress);
  }

  // ─── 记忆类事件 ───
  if (eventId === 'remember_detail') {
    return high ? pick(templates.high_trust) : pick(templates.low_trust);
  }

  // ─── 鼓励类事件 ───
  if (eventId === 'encourage') {
    if (highStress) return pick(templates.high_stress);
    return high ? pick(templates.high_trust) : pick(templates.low_trust);
  }

  // ─── 庆祝类事件 ───
  if (eventId === 'celebrate') {
    return high ? pick(templates.high_trust) : pick(templates.low_trust);
  }

  // ─── 守时类事件 ───
  if (eventId === 'show_up_on_time') {
    return high ? pick(templates.high_trust) : pick(templates.low_trust);
  }

  // ─── 失约类事件 ───
  if (eventId === 'cancel_plan') {
    if (highStress) return pick(templates.high_stress);
    return high ? pick(templates.high_trust) : pick(templates.low_trust);
  }

  // ─── 忽略类事件 ───
  if (eventId === 'ignore_message') {
    if (highStress) return pick(templates.high_stress);
    return high ? pick(templates.high_trust) : pick(templates.low_trust);
  }

  // ─── 批评类事件 ───
  if (eventId === 'criticize') {
    if (highStress) return pick(templates.high_stress);
    return high ? pick(templates.high_trust) : pick(templates.low_trust);
  }

  // ─── 要求类事件 ───
  if (eventId === 'make_demand') {
    if (highStress) return pick(templates.high_stress);
    return high ? pick(templates.high_trust) : pick(templates.low_trust);
  }

  // ─── 道歉类事件 ───
  if (eventId === 'shallow_apology') {
    return !high ? pick(templates.low_trust) : pick(templates.any);
  }
  if (eventId === 'specific_apology') {
    return high ? pick(templates.medium_trust) : pick(templates.low_trust);
  }
  if (eventId === 'concrete_action') {
    return high ? pick(templates.medium_trust) : pick(templates.low_trust);
  }
  if (eventId === 'consistency') {
    if (state.trust > 70) return pick(templates.high_trust);
    if (state.trust > 45) return pick(templates.medium_trust);
    return pick(templates.low_trust);
  }

  // ─── 通用匹配 ───
  if (templates.any) return pick(templates.any);
  if (templates.high_trust && high) return pick(templates.high_trust);
  if (templates.low_trust && !high) return pick(templates.low_trust);

  // 兜底
  if (state.valence > 0.05) return pick(TEMPLATES.default.positive);
  if (state.valence < -0.05) return pick(TEMPLATES.default.negative);
  return pick(TEMPLATES.default.neutral);
}

/**
 * 生成回复
 */
function generateResponse(eventDef, state, history) {
  return selectTemplate(eventDef, state, history);
}

module.exports = { generateResponse };
