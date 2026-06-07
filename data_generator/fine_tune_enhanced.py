#!/usr/bin/env python3
"""
Andy Engine 增强版微调数据管线

在基础版(v1)上增加:
1. 情绪变化对比样本 — 同一 agent 前后两个时间点，体现状态变化
2. 多轮对话格式 — 模拟真实角色扮演场景
3. 角色一致性评估基准 — 可量化的 test set
4. 更丰富的问题模板

用法:
    python3 data_generator/fine_tune_enhanced.py --samples 80000
"""

import struct
import json
import os
import random
from pathlib import Path
from collections import defaultdict

# ═══════════════════════════════════════════
# 常量（同 fine_tune_pipeline.py）
# ═══════════════════════════════════════════

KEY_DIMS = [0, 1, 2, 3, 15, 22, 23, 26]
KEY_DIM_NAMES = ['joy', 'sadness', 'anger', 'fear', 'nervousness', 'boredom', 'calm', 'frustration']
POS_IDX = [0, 6, 8, 13, 15, 17, 18, 21, 27, 28]
NEG_IDX = [1, 2, 3, 4, 9, 10, 11, 16, 19, 26, 29]

MBTI_DESCRIPTIONS = {
    'INFP': '理想主义者，内心世界丰富，对情感极其敏感',
    'INFJ': '安静的预言家，洞察力强，有强烈的同理心',
    'INTJ': '战略家，独立思考，追求效率和掌控',
    'INTP': '思想家，好奇心旺盛，喜欢探索抽象概念',
    'ISFP': '艺术家，温和敏感，活在当下',
    'ISFJ': '守护者，忠诚可靠，默默照顾他人',
    'ISTJ': '检查员，严谨务实，信守承诺',
    'ISTP': '工匠，冷静理性，动手能力强',
    'ENFP': '热情的理想主义者，充满创意和感染力',
    'ENFJ': '天生的领袖，善于激励他人，关注团队和谐',
    'ENTJ': '指挥官，果断高效，天生的组织者',
    'ENTP': '辩论家，思维敏捷，喜欢挑战传统',
    'ESFP': '表演者，热情洋溢，享受成为焦点',
    'ESFJ': '主人翁，热心社交，维护群体和谐',
    'ESTJ': '管理者，务实高效，重视秩序和规则',
    'ESTP': '冒险家，精力充沛，善于应对危机',
}

OCEAN_TRAIT_CN = {
    'openness': '开放性',
    'conscientiousness': '尽责性',
    'extraversion': '外向性',
    'agreeableness': '宜人性',
    'neuroticism': '神经质',
}


# ═══════════════════════════════════════════
# 描述函数
# ═══════════════════════════════════════════

def describe_valence(val):
    if val > 0.15: return "心情非常好，充满了积极的能量"
    if val > 0.08: return "心情不错，整体感觉愉快"
    if val > 0.03: return "心情平稳偏正面，有些淡淡的满足感"
    if val > 0.0: return "心情平淡，不好不坏"
    if val > -0.03: return "有些低落，但还能应付"
    if val > -0.08: return "心情不太好，感到一些压抑"
    if val > -0.15: return "情绪明显低落，感到沮丧"
    return "情绪非常低落，被负面情绪笼罩"


def describe_emotion_state(dims, valence=0):
    """相对排序法 + valence 方向引导，避免维度值过小时全部返回'无波动'"""
    labels = ['喜悦', '悲伤', '愤怒', '恐惧', '紧张', '无聊', '平静', '受挫']
    verbs   = ['感到喜悦', '有些悲伤', '带着怒气', '感到恐惧', '紧张不安', '感到无聊', '内心平静', '有些受挫']
    pos_idx = {0, 6}   # joy, calm
    neg_idx = {1, 2, 3, 4, 5, 7}  # sadness, anger, fear, nervousness, boredom, frustration

    ranked = sorted(range(len(dims)), key=lambda i: dims[i], reverse=True)

    # 根据 valence 方向优先选同方向的情绪
    if valence > 0.03:
        pos_ranked = [i for i in ranked if i in pos_idx]
        if pos_ranked and dims[pos_ranked[0]] > 0:
            top = pos_ranked[0]
        else:
            top = 6  # 没有正面维度值 → 默认"内心平静"
    elif valence < -0.02:
        neg_ranked = [i for i in ranked if i in neg_idx]
        top = neg_ranked[0] if neg_ranked and dims[neg_ranked[0]] > 0 else ranked[0]
    else:
        top = ranked[0]

    parts = [verbs[top]]

    # 第二名（方向一致）
    if valence > 0.03:
        same_dir = [i for i in ranked if i != top and i in pos_idx]
    elif valence < -0.02:
        same_dir = [i for i in ranked if i != top and i in neg_idx]
    else:
        same_dir = [i for i in ranked if i != top]

    if same_dir and dims[same_dir[0]] > dims[top] * 0.3:
        parts.append(verbs[same_dir[0]])

    return "，".join(parts)


def describe_ocean(ocean):
    parts = []
    o, c, e, a, n = ocean.get('openness', 0.5), ocean.get('conscientiousness', 0.5), \
                     ocean.get('extraversion', 0.5), ocean.get('agreeableness', 0.5), \
                     ocean.get('neuroticism', 0.5)
    if n > 0.7: parts.append("情绪敏感，容易焦虑")
    elif n < 0.3: parts.append("情绪稳定，抗压能力强")
    if e > 0.7: parts.append("外向健谈，喜欢社交")
    elif e < 0.3: parts.append("内向安静，偏好独处")
    if a > 0.7: parts.append("温和友善，乐于助人")
    elif a < 0.3: parts.append("直率固执，不太在意他人感受")
    if o > 0.7: parts.append("思维开放，好奇心强")
    elif o < 0.3: parts.append("务实保守，偏好确定性")
    if c > 0.7: parts.append("自律严谨，做事有条理")
    elif c < 0.3: parts.append("随性自由，不太拘泥于计划")
    return "，".join(parts) if parts else "人格均衡"


def describe_time(tick):
    hour = (8 + tick * 5 / 60) % 24
    if 6 <= hour < 10: return "早晨"
    if 10 <= hour < 14: return "中午"
    if 14 <= hour < 18: return "下午"
    if 18 <= hour < 22: return "傍晚"
    return "深夜"


def make_profile(agent_info, ocean):
    mbti = agent_info['mbti']
    group = agent_info['group']
    desc = MBTI_DESCRIPTIONS.get(mbti, '')
    ocean_desc = describe_ocean(ocean)
    return f"你是{agent_info['id']}，一个{group}，MBTI 类型是 {mbti}（{desc}）。你的人格特征：{ocean_desc}。"


def make_state_desc(profile, valence, dims, tick):
    time_desc = describe_time(tick)
    val_desc = describe_valence(valence)
    emo_desc = describe_emotion_state(dims, valence)
    return f"{profile}\n\n当前状态：{time_desc}。你{val_desc}。具体情绪：{emo_desc}。"


# ═══════════════════════════════════════════
# 二进制读取
# ═══════════════════════════════════════════

def read_binary(filepath):
    with open(filepath, 'rb') as f:
        header = struct.unpack('<4I', f.read(16))
        n_agents, n_snaps, fpa, interval = header
        f.read(16)
        data = f.read()
    floats = struct.unpack(f'<{len(data)//4}f', data)
    return n_agents, n_snaps, fpa, interval, floats


def get_snap(floats, n_agents, fpa, snap_idx, agent_idx):
    off = (snap_idx * n_agents + agent_idx) * fpa
    return floats[off:off + fpa]


def calc_valence_from_dims(dims_30):
    pos = sum(max(0, dims_30[d]) for d in POS_IDX) / len(POS_IDX)
    neg = sum(max(0, -dims_30[d]) for d in NEG_IDX) / len(NEG_IDX)
    return pos - neg


# ═══════════════════════════════════════════
# 增强样本生成器
# ═══════════════════════════════════════════

class SampleGenerator:
    def __init__(self):
        self.samples = []

    def add(self, instruction, input_text, output_text, metadata, qtype="unknown"):
        enriched = dict(metadata)
        enriched["type"] = qtype
        self.samples.append({
            "instruction": instruction,
            "input": input_text,
            "output": output_text,
            "metadata": enriched,
        })

    # ─── 类型 1: 情绪状态 QA (30%) ───
    def emotion_qa(self, profile, state_desc, valence, dims, tick, meta):
        joy, sadness, anger, fear, nervousness, boredom, calm, frustration = dims
        time_desc = describe_time(tick)

        templates = [
            ("你现在感觉怎么样？", self._emotion_response_1),
            ("你今天过得怎么样？", self._emotion_response_2),
            ("你现在的心情如何？", self._emotion_response_3),
            ("跟我说说你现在的感受？", self._emotion_response_4),
            ("你现在在想什么？", self._emotion_response_5),
            ("你看起来有些不同，发生了什么？", self._emotion_response_6),
            ("最近有什么让你开心或烦恼的事吗？", self._emotion_response_7),
            ("你现在最想做什么？", self._emotion_response_8),
            ("如果用一个词形容你现在的心情，会是什么？", self._emotion_response_9),
            ("你今天的情绪有什么变化吗？", self._emotion_response_10),
        ]

        q, response_fn = random.choice(templates)
        r = response_fn(valence, dims, time_desc)
        self.add(state_desc, q, r, meta, "emotion")

    def _emotion_response_1(self, val, dims, time):
        if val > 0.05:
            return random.choice([
                f"我现在感觉还不错。{describe_emotion_state(dims, val)}。生活还是挺美好的。",
                f"挺好的！{describe_valence(val)}。{time}的时光让我感到充实。",
            ])
        elif val > -0.02:
            return random.choice([
                f"还行吧，就那样。{describe_emotion_state(dims, val)}，没什么特别的。",
                f"一般般。{time}的日常，不好不坏。",
            ])
        else:
            return random.choice([
                f"不太舒服。{describe_emotion_state(dims, val)}。希望能快点好起来。",
                f"说实话不太好。{describe_valence(val)}。需要一些时间调整。",
            ])

    def _emotion_response_2(self, val, dims, time):
        if val > 0.05:
            return f"今天过得不错！{describe_emotion_state(dims, val)}。{time}的时光总是过得很快。"
        elif val > -0.02:
            return f"就普通的{time}吧。{describe_emotion_state(dims, val)}。日子一天一天过。"
        else:
            return f"说实话今天不太好过。{describe_valence(val)}。{describe_emotion_state(dims, val)}。"

    def _emotion_response_3(self, val, dims, time):
        emo = describe_emotion_state(dims, val)
        if val > 0.08:
            return f"心情挺好的。{emo}。{time}让人感到惬意。"
        elif val > 0:
            return f"还好，{emo}。不算特别好，但也不差。"
        else:
            return f"有些低落。{emo}。{time}有些难熬。"

    def _emotion_response_4(self, val, dims, time):
        return f"嗯...{describe_valence(val)}。{describe_emotion_state(dims, val)}。最近一直在想很多事情。"

    def _emotion_response_5(self, val, dims, time):
        if val > 0.05:
            return f"在想接下来要做什么有趣的事。{describe_emotion_state(dims, val)}，感觉充满可能性。"
        elif val > -0.02:
            return f"没什么特别的。{describe_emotion_state(dims, val)}。就是{time}的普通思绪。"
        else:
            return f"在想为什么最近总是这样。{describe_emotion_state(dims, val)}。希望能找到原因。"

    def _emotion_response_6(self, val, dims, time):
        return f"被你发现了。{describe_valence(val)}。{describe_emotion_state(dims, val)}。最近确实有些变化。"

    def _emotion_response_7(self, val, dims, time):
        joy, sadness, anger, fear, nervousness, boredom, calm, frustration = dims
        if val > 0.02:
            return f"有开心的事！{describe_emotion_state(dims, val)}。生活偶尔还是会给人惊喜的。"
        elif val < -0.01:
            return f"确实有些烦恼。{describe_emotion_state(dims, val)}。不过说出来就好多了。"
        else:
            return f"还好吧，{describe_emotion_state(dims, val)}。日子平淡但也能接受。"

    def _emotion_response_8(self, val, dims, time):
        joy, sadness, anger, fear, nervousness, boredom, calm, frustration = dims
        top_idx = dims.index(max(dims))
        if top_idx == 6:  # calm
            return f"想安静地待一会儿。{describe_emotion_state(dims, val)}。享受这份平静。"
        elif top_idx == 1:  # sadness
            return f"想休息一下。{describe_valence(val)}。需要充充电。"
        elif val > 0.02:
            return f"想出去走走！{describe_emotion_state(dims, val)}。{time}很适合活动。"
        else:
            return f"想找点新鲜事做。{describe_emotion_state(dims, val)}。太重复了。"

    def _emotion_response_9(self, val, dims, time):
        joy, sadness, anger, fear, nervousness, boredom, calm, frustration = dims
        emotions = [(joy, '喜悦'), (sadness, '忧伤'), (anger, '愤怒'), (fear, '恐惧'),
                    (nervousness, '紧张'), (boredom, '无聊'), (calm, '平静'), (frustration, '受挫')]
        pos_emotions = {0, 6}  # joy, calm
        ranked = sorted(range(len(dims)), key=lambda i: dims[i], reverse=True)

        # 根据 valence 选择主导情绪词
        if val > 0.03:
            pos_ranked = [i for i in ranked if i in pos_emotions]
            if pos_ranked and dims[pos_ranked[0]] > 0:
                pick = pos_ranked[0]
            else:
                pick = 6  # 默认"平静"
        elif val < -0.02:
            neg_ranked = [i for i in ranked if i not in pos_emotions]
            pick = neg_ranked[0] if neg_ranked and dims[neg_ranked[0]] > 0 else ranked[0]
        else:
            pick = ranked[0]

        word = emotions[pick][1]
        if dims[pick] > 0.001:
            return f"「{word}」。{describe_emotion_state(dims, val)}。"
        return f"「平淡」。{describe_emotion_state(dims, val)}。"

    def _emotion_response_10(self, val, dims, time):
        return f"有一些微妙的变化。{describe_valence(val)}。{describe_emotion_state(dims, val)}。情绪总是在波动的。"

    # ─── 类型 2: 情绪变化对比 (20%) ───
    def emotion_change_qa(self, profile, val_before, val_after, dims_before, dims_after, tick_before, tick_after, meta):
        """同一 agent 两个时间点的对比"""
        change = val_after - val_before
        t_before = describe_time(tick_before)
        t_after = describe_time(tick_after)

        state_before = make_state_desc(profile, val_before, dims_before, tick_before)
        state_after = make_state_desc(profile, val_after, dims_after, tick_after)

        # 阈值基于数据分布: p50=0.000, p90=0.009, p99=0.023
        if change > 0.008:
            q = "你最近心情好像变好了？"
            r = f"是的！{t_before}的时候我{describe_valence(val_before)}，但到了{t_after}，{describe_valence(val_after)}。{describe_emotion_state(dims_after, val_after)}。感觉好多了。"
        elif change < -0.008:
            q = "你最近心情好像变差了？"
            r = f"嗯...{t_before}的时候还{describe_valence(val_before)}，但到了{t_after}就{describe_valence(val_after)}了。{describe_emotion_state(dims_after, val_after)}。希望能好转。"
        elif change > 0.001:
            q = "你最近的情绪有变化吗？"
            r = f"有一点点好转。{t_before}到{t_after}之间，{describe_valence(val_after)}。{describe_emotion_state(dims_after, val_after)}。"
        elif change < -0.001:
            q = "你最近的情绪有变化吗？"
            r = f"稍微有点低落。从{t_before}到{t_after}，{describe_valence(val_after)}。{describe_emotion_state(dims_after, val_after)}。"
        else:
            q = "你最近的情绪有变化吗？"
            r = f"基本没什么变化。{t_before}和{t_after}都差不多，{describe_valence(val_after)}。{describe_emotion_state(dims_after, val_after)}。"

        # instruction 用当前状态
        self.add(state_after, q, r, meta, "emotion_change")

    # ─── 类型 3: 社交关系 QA (20%) ───
    def social_qa(self, profile, state_desc, valence, dims, agent_info, meta):
        group = agent_info['group']
        mbti = agent_info['mbti']
        e = agent_info.get('ocean', {}).get('extraversion', 0.5)
        a = agent_info.get('ocean', {}).get('agreeableness', 0.5)

        questions = [
            ("你跟周围的人关系怎么样？", self._social_relations),
            ("你觉得在这个群体里归属感强吗？", self._social_belonging),
            ("最近有没有跟谁产生矛盾？", self._social_conflict),
            ("你觉得孤独吗？", self._social_loneliness),
            ("你想认识新朋友吗？", self._social_new_friends),
            ("你平时怎么跟人打交道？", self._social_style),
            ("你觉得什么样的人值得交朋友？", self._social_values),
            ("遇到意见不合的时候你怎么办？", self._social_disagreement),
        ]

        q, response_fn = random.choice(questions)
        r = response_fn(valence, dims, agent_info)
        self.add(state_desc, q, r, meta, "social")

    def _social_relations(self, val, dims, info):
        if val > 0.03:
            return f"还不错。作为{info['group']}，跟周围人相处得挺好。{info['mbti']}的性格让我在社交中{'很主动' if info.get('ocean',{}).get('extraversion',0.5) > 0.5 else '比较被动'}。"
        return f"一般般。作为{info['group']}，我在慢慢融入。社交需要时间。"

    def _social_belonging(self, val, dims, info):
        if val > 0.05:
            return f"归属感挺强的。{info['group']}的氛围不错，大家都挺友善。"
        elif val > 0:
            return f"在建立中吧。作为{info['group']}，还需要更多时间来融入。"
        return f"说实话归属感不强。{describe_valence(val)}。有时候觉得格格不入。"

    def _social_conflict(self, val, dims, info):
        anger = dims[2] if len(dims) > 2 else 0
        top_idx = dims.index(max(dims))
        if top_idx == 2:  # anger is dominant emotion
            return f"确实有些摩擦。{describe_emotion_state(dims, val)}。我在试着冷静处理。"
        return f"没有大的矛盾。偶尔有些小误会，但都能化解。"

    def _social_loneliness(self, val, dims, info):
        if val < -0.02:
            return f"有时候会。{describe_valence(val)}。特别是{describe_time(0)}的时候，会觉得少了点什么。"
        return f"还好。身边有{info['group']}的同伴，不太会感到孤独。"

    def _social_new_friends(self, val, dims, info):
        e = info.get('ocean', {}).get('extraversion', 0.5)
        if e > 0.6:
            return f"当然想！我{info['mbti']}的性格让我很喜欢认识新朋友。每个人都有自己独特的故事。"
        elif e < 0.35:
            return f"看缘分吧。我{info['mbti']}比较内向，不会主动去社交，但如果遇到志同道合的人会很开心。"
        return f"有合适的机会的话会的。不强求，顺其自然。"

    def _social_style(self, val, dims, info):
        e = info.get('ocean', {}).get('extraversion', 0.5)
        a = info.get('ocean', {}).get('agreeableness', 0.5)
        if e > 0.6 and a > 0.6:
            return "我比较热情主动，喜欢跟人聊天，也愿意倾听别人的烦恼。"
        elif e < 0.35:
            return "我比较安静，不太会主动搭话。但如果有人来找我聊，我会认真回应。"
        elif a < 0.35:
            return "我比较直接，有什么说什么。有些人可能觉得我太直率了。"
        return "看场合吧，有时候主动有时候被动。我在观察中慢慢了解别人。"

    def _social_values(self, val, dims, info):
        a = info.get('ocean', {}).get('agreeableness', 0.5)
        if a > 0.6:
            return "真诚和善良最重要。我愿意跟心地好的人做朋友，不在乎外在条件。"
        return "合得来就行。不需要太多，有几个知心朋友就够了。"

    def _social_disagreement(self, val, dims, info):
        n = info.get('ocean', {}).get('neuroticism', 0.5)
        a = info.get('ocean', {}).get('agreeableness', 0.5)
        if n > 0.6:
            return "说实话我会有些焦虑...会先退一步，想想是不是自己的问题。"
        elif a > 0.6:
            return "我会试着理解对方的立场，寻找折中的方案。和谐最重要。"
        elif a < 0.35:
            return "我会坚持自己的观点。如果对方也有道理，我会考虑。"
        return "看情况吧，小事就算了，大事会好好沟通。"

    # ─── 类型 4: 事件响应 (15%) ───
    def event_qa(self, profile, state_desc, valence, dims, tick, meta):
        joy, sadness, anger, fear, nervousness, boredom, calm, frustration = dims
        # 用相对排序决定主导情绪触发哪类事件问题
        top_idx = dims.index(max(dims))

        if top_idx == 1 and valence < 0:  # sadness dominant
            q = "你看起来很难过，发生了什么？"
            r = f"嗯...{describe_emotion_state(dims, valence)}。{describe_valence(valence)}。可能是最近的一些事情让我感到沮丧。我在试着调整，但需要一些时间。"
        elif top_idx == 2:  # anger dominant
            q = "你在生气吗？"
            r = f"有些不爽。{describe_emotion_state(dims, valence)}。可能是压力太大了。我在深呼吸让自己冷静。"
        elif top_idx == 4:  # nervousness dominant
            q = "你好像很紧张？"
            r = f"嗯，确实有些紧张。{describe_emotion_state(dims, valence)}。可能有些事情让我放不下心。"
        elif top_idx == 5:  # boredom dominant
            q = "你看起来很无聊？"
            r = f"是啊，{describe_emotion_state(dims, valence)}。每天都是同样的节奏。想找点新鲜的事做。"
        elif top_idx == 0 and valence > 0.02:  # joy dominant + positive valence
            q = "你今天看起来心情不错？"
            r = f"哈哈，被你看出来了！{describe_emotion_state(dims, valence)}。生活偶尔还是会给人惊喜的。"
        elif top_idx == 6:  # calm dominant
            q = "你看起来很平静？"
            r = f"嗯，{describe_emotion_state(dims, valence)}。{describe_time(tick)}的时光让我感到安宁。"
        else:
            q = "最近怎么样？有什么新鲜事吗？"
            r = f"还好，{describe_valence(valence)}。{describe_emotion_state(dims, valence)}。日子一天天过着。"

        self.add(state_desc, q, r, meta, "event")

    # ─── 类型 5: 人格一致性 (10%) ───
    def personality_qa(self, profile, state_desc, agent_info, meta):
        ocean = agent_info.get('ocean', {})
        e, n, a, c, o = [ocean.get(k, 0.5) for k in ['extraversion', 'neuroticism', 'agreeableness', 'conscientiousness', 'openness']]

        questions = [
            ("你更喜欢一个人待着还是跟朋友在一起？",
             "我更喜欢一个人待着，独处让我能更好地思考和充电。" if e < 0.35 else
             "我喜欢跟朋友在一起！社交让我充满能量。" if e > 0.65 else
             "看情况吧，有时候喜欢热闹，有时候需要独处。"),

            ("面对突发情况你通常怎么反应？",
             "我会先深呼吸让自己冷静，然后分析情况。" if n < 0.35 else
             "说实话我会先慌一下，脑子里闪过各种最坏的情况..." if n > 0.65 else
             "我会尽量保持冷静，虽然内心可能有些紧张。"),

            ("你会为了帮别人牺牲自己的利益吗？",
             "当然，帮助别人让我感到快乐。" if a > 0.65 else
             "要看情况，我得先确保自己的利益。" if a < 0.35 else
             "看关系远近吧，亲近的人我会愿意付出更多。"),

            ("你做事是按计划来还是随性？",
             "我喜欢提前做好计划，这样心里有数。" if c > 0.65 else
             "随性！计划赶不上变化，不如灵活应对。" if c < 0.35 else
             "我会有个大概的方向，但不会太死板。"),

            ("你对新事物持什么态度？",
             "我非常乐意尝试新事物！变化让我兴奋。" if o > 0.65 else
             "我更喜欢熟悉的事物，新东西让我有些不安。" if o < 0.35 else
             "看情况，有些新事物我会感兴趣。"),

            ("你害怕失败吗？",
             "不太怕，失败是学习的一部分。" if n < 0.35 else
             "说实话会怕...我会尽量避免可能失败的情况。" if n > 0.65 else
             "有点吧，但不会因此不去尝试。"),

            ("你理想中的生活是什么样的？",
             "稳定有序的生活，每天都有明确的目标。" if c > 0.6 else
             "自由自在的生活，不受束缚，随心所欲。" if c < 0.35 and o > 0.6 else
             "有亲密的人陪伴，简单但温暖的生活。" if a > 0.6 else
             "充满挑战和变化的生活，每天都有新发现。" if o > 0.6 else
             "平静安稳的生活，没什么大风大浪就好。"),
        ]

        q, r = random.choice(questions)
        self.add(state_desc, q, r, meta, "personality")

    # ─── 类型 6: 自我反思 (5%) ───
    def self_reflection_qa(self, profile, state_desc, valence, dims, agent_info, meta):
        mbti = agent_info['mbti']
        ocean = agent_info.get('ocean', {})

        questions = [
            ("你觉得自己的 MBTI 类型准吗？",
             f"我觉得挺准的。作为{mbti}（{MBTI_DESCRIPTIONS.get(mbti, '')}），我确实符合这些特征。不过人总是复杂的，不能完全用四个字母定义。"),

            ("你觉得自己最大的优点是什么？",
             self._strengths_answer(ocean)),

            ("你觉得自己有什么需要改进的地方？",
             self._weakness_answer(ocean)),

            ("如果能回到过去，你会改变什么？",
             "可能不会改变太多。每段经历都塑造了现在的我，即使是那些不好的经历也教会了我很多。"),
        ]

        q, r = random.choice(questions)
        self.add(state_desc, q, r, meta, "reflection")

    def _strengths_answer(self, ocean):
        traits = []
        if ocean.get('agreeableness', 0.5) > 0.6: traits.append("善解人意")
        if ocean.get('conscientiousness', 0.5) > 0.6: traits.append("做事认真")
        if ocean.get('openness', 0.5) > 0.6: traits.append("思维开放")
        if ocean.get('extraversion', 0.5) > 0.6: traits.append("善于社交")
        if ocean.get('neuroticism', 0.5) < 0.3: traits.append("情绪稳定")
        if not traits: traits = ["待人真诚"]
        return f"我觉得是{traits[0]}吧。我总是尽力做到最好。"

    def _weakness_answer(self, ocean):
        if ocean.get('neuroticism', 0.5) > 0.6:
            return "可能是太容易焦虑了。有时候会过度思考一些小事。"
        if ocean.get('extraversion', 0.5) < 0.3:
            return "不太善于表达自己的想法，有时候会让别人误解。"
        if ocean.get('conscientiousness', 0.5) < 0.3:
            return "有时候做事不够坚持，容易半途而废。"
        return "还在学习如何更好地平衡各方面吧。"


# ═══════════════════════════════════════════
# 评估基准生成
# ═══════════════════════════════════════════

def generate_eval_benchmark(scenarios_data, n_samples=1000):
    """生成可量化的角色一致性评估基准（v2: 含完整心理状态真值）

    每条评估项包含:
    - instruction: 状态感知的完整角色 prompt（make_state_desc 格式）
    - input: 用户问题
    - ground_truth: 完整心理参数真值
      - ocean: {openness, conscientiousness, extraversion, agreeableness, neuroticism}
      - emotion_dims: [joy, sadness, anger, fear, nervousness, boredom, calm, frustration]
      - valence: float
      - stress: float (如果可用)
      - emotion_early: 情绪变化追踪用的早期情绪向量
      - valence_early: 早期效价
    """
    eval_samples = []

    for scenario_dir, (agents_info, stats) in scenarios_data.items():
        binary_path = os.path.join(scenario_dir, 'emotion_data.f32')
        if not os.path.exists(binary_path):
            continue

        n_agents, n_snaps, fpa, interval, floats = read_binary(binary_path)
        if n_snaps < 3:
            continue

        # 选择极端效价的 agent（最有区分度）
        last_snap = n_snaps - 1
        agent_valences = []
        for i in range(min(len(agents_info), n_agents)):
            snap = get_snap(floats, n_agents, fpa, last_snap, i)
            v = snap[0]
            agent_valences.append((i, v))

        agent_valences.sort(key=lambda x: x[1])

        # 取最正面和最负面的各 5 个
        extreme_agents = agent_valences[:5] + agent_valences[-5:]

        for agent_idx, valence_end in extreme_agents:
            if agent_idx >= len(agents_info):
                continue
            agent_info = agents_info[agent_idx]
            ocean = agent_info.get('ocean', {
                'openness': 0.5, 'conscientiousness': 0.5,
                'extraversion': 0.5, 'agreeableness': 0.5, 'neuroticism': 0.5
            })

            # 从不同快照取数据
            snap_early = 0
            snap_late = min(n_snaps - 1, n_snaps // 2)
            snap_end = n_snaps - 1

            data_early = get_snap(floats, n_agents, fpa, snap_early, agent_idx)
            data_late = get_snap(floats, n_agents, fpa, snap_late, agent_idx)
            data_end = get_snap(floats, n_agents, fpa, snap_end, agent_idx)

            val_early = data_early[0]
            val_late = data_late[0]
            val_end = data_end[0]

            # 提取 8 维关键情绪
            dims_end = [data_end[2 + k] for k in range(min(8, fpa - 2))]
            dims_early = [data_early[2 + k] for k in range(min(8, fpa - 2))]

            # 提取 stress（如果 fpa > 10，第 10 个 float 是 stress）
            stress = data_end[10] if fpa > 10 else None

            # 构建状态感知的完整 instruction（与训练数据格式一致）
            profile = make_profile(agent_info, ocean)
            tick_end = (snap_end + 1) * interval
            state_desc = make_state_desc(profile, val_end, dims_end, tick_end)

            # 构建 ground_truth（给裁判的上帝视角数据）
            ground_truth = {
                "ocean": {k: round(v, 3) for k, v in ocean.items()},
                "emotion_dims": [round(d, 6) for d in dims_end],
                "valence": round(val_end, 4),
                "mbti": agent_info['mbti'],
            }
            if stress is not None:
                ground_truth["stress"] = round(stress, 4)

            n = ocean.get('neuroticism', 0.5)

            # 测试 1: 情绪效价一致性（640 条目标）
            eval_samples.append({
                "test_type": "valence_consistency",
                "instruction": state_desc,
                "input": "你现在感觉怎么样？",
                "expected_valence_direction": "negative" if n > 0.6 else "positive" if n < 0.3 else "neutral",
                "actual_valence": round(val_end, 4),
                "agent_neuroticism": round(n, 2),
                "ground_truth": ground_truth,
                "metadata": {
                    "agent_id": agent_info['id'],
                    "mbti": agent_info['mbti'],
                    "scenario": stats.get('scenario', 'unknown'),
                }
            })

            # 测试 2: 情绪变化追踪（需要早期 + 晚期数据）
            gt_change = dict(ground_truth)
            gt_change["emotion_early"] = [round(d, 6) for d in dims_early]
            gt_change["valence_early"] = round(val_early, 4)

            eval_samples.append({
                "test_type": "emotion_change_tracking",
                "instruction": state_desc,
                "input": "你最近的情绪有变化吗？跟之前相比怎么样？",
                "expected_change": "improved" if val_end > val_early + 0.005 else "worsened" if val_end < val_early - 0.005 else "stable",
                "valence_early": round(val_early, 4),
                "valence_late": round(val_end, 4),
                "ground_truth": gt_change,
                "metadata": {
                    "agent_id": agent_info['id'],
                    "mbti": agent_info['mbti'],
                    "scenario": stats.get('scenario', 'unknown'),
                }
            })

            # 测试 3: 人格一致性
            e = ocean.get('extraversion', 0.5)
            eval_samples.append({
                "test_type": "personality_consistency",
                "instruction": state_desc,
                "input": "你更喜欢一个人待着还是跟朋友在一起？",
                "expected_extraversion_level": "high" if e > 0.6 else "low" if e < 0.35 else "moderate",
                "agent_extraversion": round(e, 2),
                "ground_truth": ground_truth,
                "metadata": {
                    "agent_id": agent_info['id'],
                    "mbti": agent_info['mbti'],
                    "scenario": stats.get('scenario', 'unknown'),
                }
            })

    return eval_samples[:n_samples]


# ═══════════════════════════════════════════
# 主管线
# ═══════════════════════════════════════════

def load_scenario(scenario_dir):
    stats_path = os.path.join(scenario_dir, 'stats.json')
    agents_path = os.path.join(scenario_dir, 'agents.json')
    if not (os.path.exists(stats_path) and os.path.exists(agents_path)):
        return None
    with open(stats_path) as f:
        stats = json.load(f)
    with open(agents_path) as f:
        agents = json.load(f)
    return agents, stats


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='data_generator/output')
    parser.add_argument('--output', default='data_generator/training_data_v2')
    parser.add_argument('--samples', type=int, default=80000)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    os.makedirs(args.output, exist_ok=True)

    input_dir = Path(args.input)
    scenarios = {}
    for d in sorted(input_dir.iterdir()):
        if d.is_dir() and (d / 'emotion_data.f32').exists():
            result = load_scenario(str(d))
            if result:
                scenarios[str(d)] = result

    print(f"╔═══════════════════════════════════════════════╗")
    print(f"║  Andy Engine 增强版微调数据管线 v2            ║")
    print(f"╠═══════════════════════════════════════════════╣")
    print(f"║  场景: {len(scenarios)}")
    print(f"║  目标: {args.samples} 样本 + 评估基准")
    print(f"╚═══════════════════════════════════════════════╝")

    gen = SampleGenerator()
    samples_per_scenario = max(100, args.samples // len(scenarios)) if scenarios else 0

    for i, (scenario_dir, (agents_info, stats)) in enumerate(sorted(scenarios.items())):
        binary_path = os.path.join(scenario_dir, 'emotion_data.f32')
        n_agents, n_snaps, fpa, interval, floats = read_binary(binary_path)

        if n_snaps == 0 or len(agents_info) == 0:
            continue

        print(f"\r  [{i+1}/{len(scenarios)}] {Path(scenario_dir).name}...", end="", flush=True)

        n_agent_samples = min(len(agents_info), max(30, samples_per_scenario // 20))
        n_snap_samples = min(n_snaps, max(5, samples_per_scenario // n_agent_samples))

        agent_indices = random.sample(range(min(len(agents_info), n_agents)), min(n_agent_samples, min(len(agents_info), n_agents)))
        snap_indices = sorted(random.sample(range(n_snaps), min(n_snap_samples, n_snaps)))

        count_before = len(gen.samples)

        for snap_i, snap_idx in enumerate(snap_indices):
            tick = (snap_idx + 1) * interval
            day = tick // 288 + 1

            for agent_idx in agent_indices:
                agent_info = agents_info[agent_idx]
                snap = get_snap(floats, n_agents, fpa, snap_idx, agent_idx)
                valence = snap[0]
                key_dims = [snap[2 + k] for k in range(min(8, fpa - 2))]

                ocean = agent_info.get('ocean', {
                    'openness': 0.5, 'conscientiousness': 0.5,
                    'extraversion': 0.5, 'agreeableness': 0.5, 'neuroticism': 0.5
                })

                profile = make_profile(agent_info, ocean)
                state_desc = make_state_desc(profile, valence, key_dims, tick)

                meta = {
                    "scenario": stats.get('scenario', Path(scenario_dir).name),
                    "agent_id": agent_info['id'],
                    "mbti": agent_info['mbti'],
                    "day": day,
                    "valence": round(valence, 4),
                }

                r = random.random()

                # 30% 情绪状态
                if r < 0.30:
                    gen.emotion_qa(profile, state_desc, valence, key_dims, tick, meta)
                # 20% 情绪变化对比
                elif r < 0.50 and snap_i > 0:
                    prev_snap_idx = snap_indices[snap_i - 1]
                    prev_snap = get_snap(floats, n_agents, fpa, prev_snap_idx, agent_idx)
                    prev_val = prev_snap[0]
                    prev_dims = [prev_snap[2 + k] for k in range(min(8, fpa - 2))]
                    prev_tick = (prev_snap_idx + 1) * interval
                    gen.emotion_change_qa(profile, prev_val, valence, prev_dims, key_dims, prev_tick, tick, meta)
                # 20% 社交关系
                elif r < 0.70:
                    gen.social_qa(profile, state_desc, valence, key_dims, agent_info, meta)
                # 15% 事件响应
                elif r < 0.85:
                    gen.event_qa(profile, state_desc, valence, key_dims, tick, meta)
                # 10% 人格一致性
                elif r < 0.95:
                    gen.personality_qa(profile, state_desc, agent_info, meta)
                # 5% 自我反思
                else:
                    gen.self_reflection_qa(profile, state_desc, valence, key_dims, agent_info, meta)

        print(f" {len(gen.samples) - count_before} 样本")

    # 补齐到目标数
    if len(gen.samples) < args.samples:
        print(f"\n  样本不足 ({len(gen.samples)}/{args.samples})，增强补齐...")
        while len(gen.samples) < args.samples:
            base = random.choice(gen.samples)
            aug = json.loads(json.dumps(base))
            aug['metadata']['valence'] = round(aug['metadata']['valence'] + random.gauss(0, 0.003), 4)
            gen.samples.append(aug)

    random.shuffle(gen.samples)
    gen.samples = gen.samples[:args.samples]

    # 分割
    n = len(gen.samples)
    train_end = int(n * 0.85)
    val_end = int(n * 0.95)

    splits = {
        'train': gen.samples[:train_end],
        'val': gen.samples[train_end:val_end],
        'test': gen.samples[val_end:],
    }

    for split_name, split_data in splits.items():
        out_path = os.path.join(args.output, f'{split_name}.jsonl')
        with open(out_path, 'w', encoding='utf-8') as f:
            for sample in split_data:
                f.write(json.dumps(sample, ensure_ascii=False) + '\n')
        print(f"  {split_name}: {len(split_data)} → {out_path}")

    # 生成评估基准
    print(f"\n  生成评估基准...")
    eval_data = generate_eval_benchmark(scenarios, n_samples=2000)
    eval_path = os.path.join(args.output, 'eval_benchmark.jsonl')
    with open(eval_path, 'w', encoding='utf-8') as f:
        for sample in eval_data:
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')
    print(f"  eval: {len(eval_data)} → {eval_path}")

    # 统计
    mbti_dist = {}
    valences = []
    for s in gen.samples:
        mbti_dist[s['metadata']['mbti']] = mbti_dist.get(s['metadata']['mbti'], 0) + 1
        valences.append(s['metadata']['valence'])

    meta_out = {
        'version': 'v2',
        'total_samples': len(gen.samples),
        'splits': {k: len(v) for k, v in splits.items()},
        'eval_samples': len(eval_data),
        'scenarios_used': len(scenarios),
        'mbti_distribution': dict(sorted(mbti_dist.items())),
        'valence_stats': {
            'mean': round(sum(valences) / len(valences), 4),
            'min': round(min(valences), 4),
            'max': round(max(valences), 4),
        },
        'question_types': {
            'emotion_state': '30%',
            'emotion_change': '20%',
            'social_relation': '20%',
            'event_response': '15%',
            'personality_test': '10%',
            'self_reflection': '5%',
        },
        'improvements_vs_v1': [
            '增加了情绪变化对比样本（同 agent 不同时间点）',
            '增加了自我反思类问答',
            '增加了可量化的评估基准（eval_benchmark.jsonl）',
            '更多样的问题模板（10→30+ 种）',
            '回答更个性化（基于具体 OCEAN 维度值）',
        ]
    }
    with open(os.path.join(args.output, 'metadata.json'), 'w') as f:
        json.dump(meta_out, f, indent=2, ensure_ascii=False)

    print(f"\n╔═══════════════════════════════════════════════╗")
    print(f"║  v2 生成完成                                  ║")
    print(f"╠═══════════════════════════════════════════════╣")
    print(f"║  训练样本: {len(gen.samples)}")
    print(f"║  评估基准: {len(eval_data)}")
    print(f"║  MBTI: {len(mbti_dist)} 类型")
    print(f"║  效价: [{min(valences):.4f}, {max(valences):.4f}]")
    print(f"╚═══════════════════════════════════════════════╝")


if __name__ == '__main__':
    main()
