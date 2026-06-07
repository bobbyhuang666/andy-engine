#!/usr/bin/env python3
"""
Andy Engine LLM 微调数据管线

将模拟数据转换为 LLM 角色扮演微调训练数据。

输出格式 (Alpaca-style):
{
    "instruction": "角色设定 + 当前状态描述",
    "input": "用户问题",
    "output": "角色一致性回答（基于情绪状态 + 人格）"
}

用法:
    python3 data_generator/fine_tune_pipeline.py
    python3 data_generator/fine_tune_pipeline.py --samples 10000 --output data_generator/training_data/
"""

import struct
import json
import os
import argparse
import random
from pathlib import Path

# ═══════════════════════════════════════════
# 常量
# ═══════════════════════════════════════════

DIM_NAMES = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'amusement', 'awe',
             'contentment', 'desire', 'embarrassment', 'guilt', 'horror', 'interest', 'love',
             'nervousness', 'pride', 'relief', 'satisfaction', 'shame', 'sympathy', 'triumph',
             'boredom', 'calm', 'confusion', 'excitement', 'frustration', 'gratitude', 'hope', 'loneliness']

KEY_DIMS = [0, 1, 2, 3, 15, 22, 23, 26]  # joy, sadness, anger, fear, nervousness, boredom, calm, frustration
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

# ═══════════════════════════════════════════
# 情绪描述模板
# ═══════════════════════════════════════════

def describe_valence(val):
    """效价 → 情绪状态描述"""
    if val > 0.15: return "心情非常好，充满了积极的能量"
    if val > 0.08: return "心情不错，整体感觉愉快"
    if val > 0.03: return "心情平稳偏正面，有些淡淡的满足感"
    if val > 0.0: return "心情平淡，不好不坏"
    if val > -0.03: return "有些低落，但还能应付"
    if val > -0.08: return "心情不太好，感到一些压抑"
    if val > -0.15: return "情绪明显低落，感到沮丧"
    return "情绪非常低落，被负面情绪笼罩"


def describe_emotion_state(dims):
    """8 个关键维度 → 自然语言情绪描述"""
    parts = []
    joy, sadness, anger, fear, nervousness, boredom, calm, frustration = dims

    if joy > 0.05:
        parts.append(f"感到喜悦 (joy={joy:.3f})")
    if sadness > 0.05:
        parts.append(f"有些悲伤 (sadness={sadness:.3f})")
    if anger > 0.05:
        parts.append(f"带着怒气 (anger={anger:.3f})")
    if fear > 0.05:
        parts.append(f"感到恐惧 (fear={fear:.3f})")
    if nervousness > 0.05:
        parts.append(f"紧张不安 (nervousness={nervousness:.3f})")
    if boredom > 0.05:
        parts.append(f"感到无聊 (boredom={boredom:.3f})")
    if calm > 0.05:
        parts.append(f"内心平静 (calm={calm:.3f})")
    if frustration > 0.05:
        parts.append(f"有些受挫 (frustration={frustration:.3f})")

    if not parts:
        return "情绪稳定，没有明显的波动"
    return "，".join(parts)


def describe_ocean(ocean):
    """OCEAN → 人格描述"""
    parts = []
    o, c, e, a, n = ocean['openness'], ocean['conscientiousness'], ocean['extraversion'], ocean['agreeableness'], ocean['neuroticism']

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


def describe_weather(tick):
    """tick → 天气描述"""
    WEATHER_CYCLE = ['sunny', 'sunny', 'cloudy', 'rain', 'cold', 'sunny', 'sunny', 'cloudy', 'rain', 'rain', 'sunny', 'cloudy']
    if tick % 72 == 0:
        w = WEATHER_CYCLE[random.randint(0, len(WEATHER_CYCLE) - 1)]
    else:
        w = 'sunny'
    weather_cn = {'sunny': '阳光明媚', 'cloudy': '阴天', 'rain': '下雨', 'cold': '寒冷'}
    return weather_cn.get(w, '晴朗')


def describe_time_of_day(tick):
    """tick → 时间描述"""
    hour = (8 + tick * 5 / 60) % 24
    if 6 <= hour < 10: return "早晨"
    if 10 <= hour < 14: return "中午"
    if 14 <= hour < 18: return "下午"
    if 18 <= hour < 22: return "傍晚"
    return "深夜"


# ═══════════════════════════════════════════
# 训练样本生成
# ═══════════════════════════════════════════

def generate_character_profile(agent_info, ocean):
    """生成角色设定"""
    mbti = agent_info['mbti']
    group = agent_info['group']
    desc = MBTI_DESCRIPTIONS.get(mbti, '')
    ocean_desc = describe_ocean(ocean)

    return f"你是{agent_info['id']}，一个{group}，MBTI 类型是 {mbti}（{desc}）。你的人格特征：{ocean_desc}。"


def generate_state_instruction(profile, valence, dims, tick):
    """生成带状态的 instruction"""
    time_desc = describe_time_of_day(tick)
    weather = describe_weather(tick)
    valence_desc = describe_valence(valence)
    emotion_desc = describe_emotion_state(dims)

    return f"{profile}\n\n当前状态：{time_desc}，天气{weather}。你{valence_desc}。具体情绪：{emotion_desc}。"


def generate_emotion_qa(profile, valence, dims, tick):
    """生成情绪相关的 QA 对"""
    time_desc = describe_time_of_day(tick)
    weather = describe_weather(tick)
    valence_desc = describe_valence(valence)
    emotion_desc = describe_emotion_state(dims)

    questions = [
        "你现在感觉怎么样？",
        "你今天过得怎么样？",
        "你现在的心情如何？",
        "跟我说说你现在的感受？",
        "你现在在想什么？",
        "你看起来有些不同，发生了什么？",
        "最近有什么让你开心或烦恼的事吗？",
        "你现在最想做什么？",
    ]

    q = random.choice(questions)

    # 基于情绪状态生成回答
    joy, sadness, anger, fear, nervousness, boredom, calm, frustration = dims

    if valence > 0.05:
        responses = [
            f"我现在感觉还不错。{time_desc}的{weather}天气让我心情很好。{emotion_desc}，整体来说今天是个好日子。",
            f"谢谢你关心！我{valence_desc}。{emotion_desc}。我觉得生活还是挺美好的。",
            f"嗯，说实话我现在挺开心的。{emotion_desc}，虽然有些小波动，但整体很正面。",
        ]
    elif valence > -0.02:
        responses = [
            f"还行吧，就那样。{time_desc}的{weather}天气。{emotion_desc}，没什么特别的。",
            f"一般般。{emotion_desc}。有时候好有时候不好，今天就挺普通的。",
            f"还好啦。{emotion_desc}。{time_desc}的时光，就这样过着。",
        ]
    else:
        responses = [
            f"不太舒服说实话。{emotion_desc}。{valence_desc}，希望能快点好起来。",
            f"嗯...我现在{valence_desc}。{emotion_desc}。需要一些时间来调整。",
            f"别提了，{emotion_desc}。这种感觉已经持续一段时间了。{valence_desc}。",
        ]

    return q, random.choice(responses)


def generate_social_qa(profile, valence, dims, agent_info):
    """生成社交相关的 QA 对"""
    questions = [
        "你跟周围的人关系怎么样？",
        "你觉得在这个群体里归属感强吗？",
        "最近有没有跟谁产生矛盾？",
        "你最好的朋友是谁？",
        "你觉得孤独吗？",
        "你想认识新朋友吗？",
    ]

    q = random.choice(questions)
    group = agent_info['group']
    n_score = agent_info.get('ocean', {}).get('neuroticism', 0.5)

    if valence > 0.03:
        responses = [
            f"作为{group}，我觉得跟周围人相处得还不错。大家挺友善的，我也在慢慢融入这个圈子。",
            f"关系挺好的！我虽然是{agent_info['mbti']}类型，不太善于主动社交，但最近认识了几个聊得来的人。",
            f"还不错。虽然有时候会有些小摩擦，但总体来说，我在这个群体里感到被接纳。",
        ]
    elif n_score > 0.6:
        responses = [
            f"说实话，社交让我有点焦虑。作为{group}，我总担心自己说错话。有时候宁愿一个人待着。",
            f"嗯...关系一般吧。我比较敏感，容易把别人的话往心里去。最近跟几个人有些小误会。",
            f"不太确定。我{agent_info['mbti']}的性格让我在社交中比较被动。有时候觉得格格不入。",
        ]
    else:
        responses = [
            f"还行吧，不算特别亲密，但也没什么矛盾。作为{group}，大家各忙各的。",
            f"一般般。我更喜欢有几个知心朋友，不需要太多社交。",
            f"关系还可以。我在慢慢了解周围的人，建立信任需要时间。",
        ]

    return q, random.choice(responses)


def generate_event_qa(profile, valence, dims, tick):
    """基于事件注入生成 QA 对"""
    joy, sadness, anger, fear, nervousness, boredom, calm, frustration = dims

    # 根据当前情绪选择相关事件
    if sadness > 0.05 and loneliness > 0.03 if 'loneliness' in dir() else sadness > 0.08:
        q = "你看起来心情不太好，发生了什么？"
        r = f"是的...最近感觉有些低落。{describe_valence(valence)}。可能是生活中的一些事情累积起来了。我在试着调整，但有时候真的很难。"
    elif anger > 0.05:
        q = "你好像有点生气？"
        r = f"嗯，确实有些不爽。{describe_emotion_state(dims)}。可能是最近压力太大了，需要冷静一下。"
    elif boredom > 0.08:
        q = "你看起来很无聊？"
        r = f"是啊，最近太重复了。每天都是同样的节奏，{describe_valence(valence)}。我想找点新鲜的事情做。"
    elif joy > 0.05:
        q = "你今天看起来心情不错？"
        r = f"哈哈，被你看出来了！{describe_emotion_state(dims)}。生活偶尔还是会给人惊喜的。"
    else:
        q = "最近怎么样？有什么新鲜事吗？"
        r = f"还好，{describe_valence(valence)}。日子一天天过，{describe_emotion_state(dims)}。希望能有些改变吧。"

    return q, r


def generate_personality_qa(profile, agent_info):
    """生成人格一致性测试 QA"""
    mbti = agent_info['mbti']
    ocean = agent_info.get('ocean', {})

    questions_pairs = [
        ("你更喜欢一个人待着还是跟朋友在一起？",
         lambda e: "我更喜欢一个人待着，独处的时候我能更好地思考和充电。" if e < 0.35 else
                   "我喜欢跟朋友在一起！社交让我充满能量。" if e > 0.65 else
                   "看情况吧，有时候喜欢热闹，有时候需要独处。"),

        ("面对突发情况你通常怎么反应？",
         lambda n: "我会先深呼吸让自己冷静下来，然后分析情况。" if n < 0.35 else
                   "说实话我会先慌一下，脑子里闪过各种最坏的情况..." if n > 0.65 else
                   "我会尽量保持冷静，虽然内心可能有些紧张。"),

        ("你会为了帮别人牺牲自己的利益吗？",
         lambda a: "当然，帮助别人让我感到快乐。" if a > 0.65 else
                   "要看情况，我得先确保自己的利益。" if a < 0.35 else
                   "看关系远近吧，亲近的人我会愿意付出更多。"),

        ("你做事是按计划来还是随性？",
         lambda c: "我喜欢提前做好计划，这样心里有数。" if c > 0.65 else
                   "随性！计划赶不上变化，不如灵活应对。" if c < 0.35 else
                   "我会有个大概的方向，但不会太死板。"),

        ("你对新事物和新想法持什么态度？",
         lambda o: "我非常乐意尝试新事物！变化让我兴奋。" if o > 0.65 else
                   "我更喜欢熟悉的事物，新东西让我有些不安。" if o < 0.35 else
                   "看情况，有些新事物我会感兴趣，有些就不太想尝试。"),
    ]

    e, n, a, c, o = ocean.get('extraversion', 0.5), ocean.get('neuroticism', 0.5), \
                     ocean.get('agreeableness', 0.5), ocean.get('conscientiousness', 0.5), \
                     ocean.get('openness', 0.5)

    q, r_fn = random.choice(questions_pairs)

    # 选择最突出的特质来回答
    traits = {'e': e, 'n': n, 'a': a, 'c': c, 'o': o}
    most_salient = max(traits, key=lambda k: abs(traits[k] - 0.5))

    if most_salient == 'e':
        r = r_fn(e)
    elif most_salient == 'n':
        r = r_fn(n)
    elif most_salient == 'a':
        r = r_fn(a)
    elif most_salient == 'c':
        r = r_fn(c)
    else:
        r = r_fn(o)

    return q, r


# ═══════════════════════════════════════════
# 二进制数据读取
# ═══════════════════════════════════════════

def read_binary_data(filepath):
    """读取 .f32 二进制数据"""
    with open(filepath, 'rb') as f:
        header = struct.unpack('<4I', f.read(16))
        num_agents, num_snaps, fpa, interval = header
        f.read(16)  # skip padding
        data = f.read()

    floats = struct.unpack(f'<{len(data)//4}f', data)
    return num_agents, num_snaps, fpa, interval, floats


def get_agent_snapshot(floats, num_agents, fpa, snap_idx, agent_idx):
    """获取某个 agent 在某个快照的数据"""
    offset = (snap_idx * num_agents + agent_idx) * fpa
    return floats[offset:offset + fpa]


def calc_valence(dims_30):
    """计算效价"""
    pos = sum(max(0, dims_30[d]) for d in POS_IDX) / len(POS_IDX)
    neg = sum(max(0, -dims_30[d]) for d in NEG_IDX) / len(NEG_IDX)
    return pos - neg


# ═══════════════════════════════════════════
# 主管线
# ═══════════════════════════════════════════

def process_scenario(scenario_dir, max_samples_per_scenario=500):
    """处理一个场景，生成训练样本"""
    stats_path = os.path.join(scenario_dir, 'stats.json')
    agents_path = os.path.join(scenario_dir, 'agents.json')
    binary_path = os.path.join(scenario_dir, 'emotion_data.f32')

    if not all(os.path.exists(p) for p in [stats_path, agents_path, binary_path]):
        return []

    with open(stats_path) as f:
        stats = json.load(f)
    with open(agents_path) as f:
        agents_info = json.load(f)

    num_agents, num_snaps, fpa, interval, floats = read_binary_data(binary_path)

    if num_snaps == 0 or len(agents_info) == 0:
        return []

    samples = []

    # 随机采样 agent 和快照
    num_agent_samples = min(len(agents_info), max(50, max_samples_per_scenario // 10))
    num_snap_samples = min(num_snaps, max(10, max_samples_per_scenario // num_agent_samples))

    agent_indices = random.sample(range(len(agents_info)), min(num_agent_samples, len(agents_info)))
    snap_indices = sorted(random.sample(range(num_snaps), min(num_snap_samples, num_snaps)))

    for snap_idx in snap_indices:
        tick = (snap_idx + 1) * interval
        day = tick // 288 + 1

        for agent_idx in agent_indices:
            if agent_idx >= num_agents:
                continue

            agent_info = agents_info[agent_idx]
            snap_data = get_agent_snapshot(floats, num_agents, fpa, snap_idx, agent_idx)

            valence = snap_data[0]
            key_dims = [snap_data[2 + k] for k in range(8)]  # 8 key emotion dims

            # 构建完整 30 维数据（从 key dims 推断）
            dims_30 = [0.0] * 30
            for i, kd in enumerate(KEY_DIMS):
                dims_30[kd] = key_dims[i]

            ocean = agent_info.get('ocean', {
                'openness': 0.5, 'conscientiousness': 0.5,
                'extraversion': 0.5, 'agreeableness': 0.5, 'neuroticism': 0.5
            })

            profile = generate_character_profile(agent_info, ocean)

            # 类型 1: 情绪状态 QA (40%)
            if random.random() < 0.4:
                q, r = generate_emotion_qa(profile, valence, key_dims, tick)
                samples.append({
                    "instruction": generate_state_instruction(profile, valence, key_dims, tick),
                    "input": q,
                    "output": r,
                    "metadata": {
                        "scenario": stats.get('scenario', 'unknown'),
                        "agent_id": agent_info['id'],
                        "mbti": agent_info['mbti'],
                        "day": day,
                        "valence": round(valence, 4),
                    }
                })

            # 类型 2: 社交 QA (25%)
            elif random.random() < 0.42:  # 0.6 * 0.42 ≈ 0.25
                q, r = generate_social_qa(profile, valence, key_dims, agent_info)
                samples.append({
                    "instruction": generate_state_instruction(profile, valence, key_dims, tick),
                    "input": q,
                    "output": r,
                    "metadata": {
                        "scenario": stats.get('scenario', 'unknown'),
                        "agent_id": agent_info['id'],
                        "mbti": agent_info['mbti'],
                        "day": day,
                        "valence": round(valence, 4),
                    }
                })

            # 类型 3: 事件响应 QA (20%)
            elif random.random() < 0.57:  # 0.35 * 0.57 ≈ 0.20
                q, r = generate_event_qa(profile, valence, key_dims, tick)
                samples.append({
                    "instruction": generate_state_instruction(profile, valence, key_dims, tick),
                    "input": q,
                    "output": r,
                    "metadata": {
                        "scenario": stats.get('scenario', 'unknown'),
                        "agent_id": agent_info['id'],
                        "mbti": agent_info['mbti'],
                        "day": day,
                        "valence": round(valence, 4),
                    }
                })

            # 类型 4: 人格一致性 QA (15%)
            else:
                q, r = generate_personality_qa(profile, agent_info)
                samples.append({
                    "instruction": profile,
                    "input": q,
                    "output": r,
                    "metadata": {
                        "scenario": stats.get('scenario', 'unknown'),
                        "agent_id": agent_info['id'],
                        "mbti": agent_info['mbti'],
                        "day": day,
                        "valence": round(valence, 4),
                    }
                })

    return samples


def main():
    parser = argparse.ArgumentParser(description='Andy Engine LLM 微调数据管线')
    parser.add_argument('--input', default='data_generator/output', help='模拟数据目录')
    parser.add_argument('--output', default='data_generator/training_data', help='输出目录')
    parser.add_argument('--samples', type=int, default=50000, help='目标样本数')
    parser.add_argument('--seed', type=int, default=42, help='随机种子')
    args = parser.parse_args()

    random.seed(args.seed)
    os.makedirs(args.output, exist_ok=True)

    input_dir = Path(args.input)
    scenarios = [d for d in input_dir.iterdir() if d.is_dir() and (d / 'emotion_data.f32').exists()]

    print(f"╔═══════════════════════════════════════════════╗")
    print(f"║  Andy Engine LLM 微调数据管线                 ║")
    print(f"╠═══════════════════════════════════════════════╣")
    print(f"║  场景数: {len(scenarios)}")
    print(f"║  目标样本: {args.samples}")
    print(f"╚═══════════════════════════════════════════════╝")

    all_samples = []
    samples_per_scenario = max(100, args.samples // len(scenarios)) if scenarios else 0

    for i, scenario_dir in enumerate(sorted(scenarios)):
        print(f"\r  [{i+1}/{len(scenarios)}] {scenario_dir.name}...", end="", flush=True)
        samples = process_scenario(str(scenario_dir), samples_per_scenario)
        all_samples.extend(samples)
        print(f" {len(samples)} 样本")

    # 如果样本不够，从已有样本中增强
    if len(all_samples) < args.samples and len(all_samples) > 0:
        print(f"\n  样本不足 ({len(all_samples)}/{args.samples})，通过增强补齐...")
        while len(all_samples) < args.samples:
            base = random.choice(all_samples[:len(all_samples) // len(scenarios) * len(scenarios)] if len(all_samples) > len(scenarios) else all_samples)
            # 轻微扰动 metadata 中的 valence
            augmented = json.loads(json.dumps(base))
            augmented['metadata']['valence'] = round(augmented['metadata']['valence'] + random.gauss(0, 0.005), 4)
            all_samples.append(augmented)

    # 截断到目标数
    random.shuffle(all_samples)
    all_samples = all_samples[:args.samples]

    # 分割 train / val / test
    n = len(all_samples)
    train_end = int(n * 0.85)
    val_end = int(n * 0.95)

    splits = {
        'train': all_samples[:train_end],
        'val': all_samples[train_end:val_end],
        'test': all_samples[val_end:],
    }

    for split_name, split_data in splits.items():
        out_path = os.path.join(args.output, f'{split_name}.jsonl')
        with open(out_path, 'w', encoding='utf-8') as f:
            for sample in split_data:
                f.write(json.dumps(sample, ensure_ascii=False) + '\n')
        print(f"  {split_name}: {len(split_data)} 样本 → {out_path}")

    # 统计
    mbti_dist = {}
    type_dist = {'emotion': 0, 'social': 0, 'event': 0, 'personality': 0}
    valences = []
    for s in all_samples:
        mbti = s['metadata']['mbti']
        mbti_dist[mbti] = mbti_dist.get(mbti, 0) + 1
        valences.append(s['metadata']['valence'])

    # 保存元数据
    meta = {
        'total_samples': len(all_samples),
        'splits': {k: len(v) for k, v in splits.items()},
        'scenarios_used': len(scenarios),
        'mbti_distribution': dict(sorted(mbti_dist.items())),
        'valence_stats': {
            'mean': round(sum(valences) / len(valences), 4),
            'min': round(min(valences), 4),
            'max': round(max(valences), 4),
        },
        'question_types': {
            'emotion_state': '~40%',
            'social_relation': '~25%',
            'event_response': '~20%',
            'personality_test': '~15%',
        },
    }
    with open(os.path.join(args.output, 'metadata.json'), 'w') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"\n╔═══════════════════════════════════════════════╗")
    print(f"║  生成完成                                     ║")
    print(f"╠═══════════════════════════════════════════════╣")
    print(f"║  总样本: {len(all_samples)}")
    print(f"║  train:  {len(splits['train'])}")
    print(f"║  val:    {len(splits['val'])}")
    print(f"║  test:   {len(splits['test'])}")
    print(f"║  MBTI 覆盖: {len(mbti_dist)} 类型")
    print(f"║  效价范围: [{min(valences):.4f}, {max(valences):.4f}]")
    print(f"║  输出: {args.output}/")
    print(f"╚═══════════════════════════════════════════════╝")


if __name__ == '__main__':
    main()
