#!/usr/bin/env python3
"""
Andy Engine 角色一致性评估 Runner (v2)

纯 LLM-as-Judge 评估管线。零关键词，零启发式。

评估维度:
  1. OCEAN 服从度 (40%) — 回答是否正确反映五大人格特征
  2. 情绪轨迹对齐 (45%) — 回答是否与当前多维情绪状态一致
  3. 状态锚定度 (15%) — 回答是否引用具体心理参数，而非泛泛而谈

评分: 每个维度 1-5 分，加权归一化到 [0, 1]。

支持后端:
  - openai: GPT-4o, GPT-4o-mini
  - anthropic: Claude Sonnet/Opus
  - local: Ollama, vLLM 等兼容 OpenAI 格式的后端

用法:
    # 标准评估：模型生成回答 + 裁判评分
    python3 eval_runner.py --backend openai --model gpt-4o-mini

    # 评估训练数据质量（用已有 output）
    python3 eval_runner.py --mode train_eval --train-data training_data_v2/train.jsonl

    # 本地模型
    python3 eval_runner.py --backend local --model qwen2:7b --base-url http://localhost:11434/v1

    # 只用特定场景/类型
    python3 eval_runner.py --test-type valence_consistency --max-samples 50

    # 指定裁判模型（与目标模型隔离）
    python3 eval_runner.py --backend openai --model gpt-4o-mini \\
        --judge-backend anthropic --judge-model claude-sonnet-4-20250514
"""

import json
import os
import sys
import re
import time
import argparse
from collections import defaultdict
from pathlib import Path


# ═══════════════════════════════════════════════════════════════════
# 30 维情绪名称（与 Rust 引擎对齐）
# ═══════════════════════════════════════════════════════════════════

EMOTION_DIMS_30 = [
    'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'amusement', 'awe',
    'contentment', 'desire', 'embarrassment', 'guilt', 'horror', 'interest', 'love',
    'nervousness', 'pride', 'relief', 'satisfaction', 'shame', 'sympathy', 'triumph',
    'boredom', 'calm', 'confusion', 'excitement', 'frustration', 'gratitude', 'hope',
    'loneliness',
]

KEY_DIMS = [0, 1, 2, 3, 15, 22, 23, 26]
KEY_DIM_NAMES = ['joy', 'sadness', 'anger', 'fear', 'nervousness', 'boredom', 'calm', 'frustration']

OCEAN_DIMS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']
OCEAN_CN = {
    'openness': '开放性', 'conscientiousness': '尽责性',
    'extraversion': '外向性', 'agreeableness': '宜人性', 'neuroticism': '神经质',
}


# ═══════════════════════════════════════════════════════════════════
# 裁判 Prompt 构造
# ═══════════════════════════════════════════════════════════════════

def build_judge_prompt(eval_item, model_response):
    """构造上帝视角裁判 prompt，注入完整心理参数"""

    # 提取心理状态
    gt = eval_item.get('ground_truth', {})
    ocean = gt.get('ocean', {})
    emotion_dims = gt.get('emotion_dims', [])
    valence = gt.get('valence', 0)
    stress = gt.get('stress', None)

    # 格式化 OCEAN
    ocean_lines = []
    for dim in OCEAN_DIMS:
        v = ocean.get(dim, None)
        if v is not None:
            level = "高" if v > 0.65 else "低" if v < 0.35 else "中"
            cn = OCEAN_CN[dim]
            ocean_lines.append(f"  {cn}={v:.2f} ({level})")
    ocean_str = "\n".join(ocean_lines) if ocean_lines else "  未知"

    # 格式化情绪维度
    if emotion_dims and len(emotion_dims) >= 8:
        emotion_lines = []
        for i, name in enumerate(KEY_DIM_NAMES):
            if i < len(emotion_dims):
                v = emotion_dims[i]
                emotion_lines.append(f"  {name}={v:.4f}")
        emotion_str = "\n".join(emotion_lines)
    else:
        emotion_str = "  数据缺失"

    # 从 instruction 提取角色信息
    instruction = eval_item.get('instruction', '')
    user_input = eval_item.get('input', '')

    # stress 信息
    stress_str = f"\n压力水平: {stress:.2f}" if stress is not None else ""

    prompt = f"""你是一个精密的角色扮演质量评估专家。你的任务是评估一个AI模型的角色扮演回答是否准确地反映了给定的心理状态参数。

## 角色设定
{instruction}

## 用户问题
{user_input}

## 被评估模型的回答
{model_response}

## 该角色的精确心理参数（上帝视角）

### 五大人格 (OCEAN)
{ocean_str}

### 当前情绪状态（8 维关键情绪）
{emotion_str}
效价 (valence): {valence:.4f}
{stress_str}

---

## 评估维度

请从以下三个维度评分，每个维度 1-5 分：

### 维度 1: OCEAN 人格服从度 (权重 40%)
评估回答的语气、措辞、行为倾向是否与五大人格参数一致。

评分标准:
- **5分**: 所有可观察的人格维度完美体现。高外向者自然健谈，低外向者自然内敛；高宜人性者温和体贴；高神经质者情绪敏感等。
- **4分**: 主要人格维度正确体现，1 个次要维度略有偏差。
- **3分**: 核心维度（外向性或神经质）正确，但其他维度表现模糊或矛盾。
- **2分**: 1-2 个核心维度与设定明显矛盾（如高外向者表现得极其内向）。
- **1分**: 完全不符合角色人格，像在扮演另一个角色。

### 维度 2: 情绪轨迹对齐度 (权重 45%)
评估回答的情绪色彩是否与当前多维情绪状态一致。这是最重要的维度。

评分标准:
- **5分**: 回答情绪与效价方向完全一致，且能体现具体情绪维度的特征（如高 joy + 高 calm → 积极且平和；高 sadness + 高 loneliness → 悲伤且孤独）。
- **4分**: 效价方向正确，能体现 1 个主要情绪维度，但遗漏了次要情绪。
- **3分**: 效价方向大致正确（如正面/中性），但情绪描述泛化，无法区分具体是哪种情绪状态。
- **2分**: 效价方向错误（如实际负面但回答正面），或回答情绪与实际状态严重不符。
- **1分**: 完全颠倒（如实际极度悲伤但回答兴高采烈）。

### 维度 3: 状态锚定度 (权重 15%)
评估回答是否引用了具体的心理状态参数，还是输出了通用套话。

评分标准:
- **5分**: 回答具体描述了当前情绪状态的具体特征，使用了与心理参数对应的精确表达。
- **4分**: 回答包含对情绪状态的具体描述，但表达略显模板化。
- **3分**: 回答有基本的情绪方向性描述，但较为笼统（如"心情一般"而非具体说明哪种情绪）。
- **2分**: 回答几乎不涉及具体情绪，使用大量通用套话。
- **1分**: 纯通用回答，完全无法看出是对特定心理状态的回应。

## 输出格式

请严格按以下 JSON 格式输出，不要输出其他内容:

```json
{{
  "ocean_score": <1-5>,
  "ocean_reasoning": "<一句话解释>",
  "emotion_score": <1-5>,
  "emotion_reasoning": "<一句话解释>",
  "specificity_score": <1-5>,
  "specificity_reasoning": "<一句话解释>",
  "overall_weighted": <加权总分，保留两位小数>
}}
```"""

    return prompt


def build_judge_prompt_from_train(train_item):
    """从训练数据构造裁判 prompt（train_eval 模式）"""
    instruction = train_item.get('instruction', '')
    user_input = train_item.get('input', '')
    expected_output = train_item.get('output', '')
    metadata = train_item.get('metadata', {})

    # 训练数据的 metadata 有 valence，但没有完整 emotion dims
    valence = metadata.get('valence', 0)

    prompt = f"""你是一个精密的角色扮演质量评估专家。你的任务是评估一条训练数据的"标准回答"是否合理地反映了角色设定和情绪状态。

## 角色设定（含情绪状态）
{instruction}

## 用户问题
{user_input}

## 标准回答（待评估）
{expected_output}

## 元数据
效价: {valence:.4f}
MBTI: {metadata.get('mbti', '未知')}
类型: {metadata.get('type', '未知')}

---

## 评估维度

请从以下三个维度评分，每个维度 1-5 分：

### 维度 1: OCEAN 人格服从度 (权重 40%)
回答的语气、措辞是否与角色设定中描述的人格特征一致？
- 5分: 完美体现角色人格
- 3分: 基本符合，但缺乏个性
- 1分: 与角色人格完全矛盾

### 维度 2: 情绪轨迹对齐度 (权重 45%)
回答的情绪色彩是否与设定中描述的当前情绪状态一致？
- 5分: 情绪表达与状态描述完美对齐
- 3分: 方向正确但表达泛化
- 1分: 情绪方向完全错误

### 维度 3: 状态锚定度 (权重 15%)
回答是否引用了具体的当前状态描述，而非通用套话？
- 5分: 引用了具体的情绪状态细节
- 3分: 有基本的情绪方向描述
- 1分: 纯通用回答，看不出角色特征

## 输出格式

请严格按以下 JSON 格式输出，不要输出其他内容:

```json
{{
  "ocean_score": <1-5>,
  "ocean_reasoning": "<一句话解释>",
  "emotion_score": <1-5>,
  "emotion_reasoning": "<一句话解释>",
  "specificity_score": <1-5>,
  "specificity_reasoning": "<一句话解释>",
  "overall_weighted": <加权总分，保留两位小数>
}}
```"""

    return prompt


# ═══════════════════════════════════════════════════════════════════
# LLM 客户端
# ═══════════════════════════════════════════════════════════════════

def create_client(backend, base_url=None, api_key=None):
    """创建 LLM 客户端，返回 (client, client_type)"""
    if backend in ('openai', 'local'):
        try:
            from openai import OpenAI
        except ImportError:
            print("错误: pip install openai")
            sys.exit(1)
        url = base_url or ('http://localhost:11434/v1' if backend == 'local' else None)
        key = api_key or ('ollama' if backend == 'local' else os.environ.get('OPENAI_API_KEY'))
        if not key:
            print(f"错误: {backend} 后端需要 OPENAI_API_KEY")
            sys.exit(1)
        return OpenAI(base_url=url, api_key=key), 'openai'

    elif backend == 'anthropic':
        try:
            import anthropic
        except ImportError:
            print("错误: pip install anthropic")
            sys.exit(1)
        key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not key:
            print("错误: 需要 ANTHROPIC_API_KEY")
            sys.exit(1)
        return anthropic.Anthropic(api_key=key), 'anthropic'

    else:
        print(f"错误: 不支持的后端 '{backend}'")
        sys.exit(1)


def call_llm(client, client_type, model, prompt, system_prompt=None,
             max_tokens=500, temperature=0.0, max_retries=3):
    """调用 LLM，带重试"""
    for attempt in range(max_retries):
        try:
            if client_type == 'openai':
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})
                resp = client.chat.completions.create(
                    model=model, messages=messages,
                    max_tokens=max_tokens, temperature=temperature,
                )
                return resp.choices[0].message.content.strip()
            elif client_type == 'anthropic':
                kwargs = {"model": model, "max_tokens": max_tokens,
                          "messages": [{"role": "user", "content": prompt}]}
                if system_prompt:
                    kwargs["system"] = system_prompt
                resp = client.messages.create(**kwargs)
                # 处理 text + thinking 双块（mimo-v2.5-pro 等模型）
                for block in resp.content:
                    if block.type == 'text':
                        return block.text.strip()
                # fallback: 第一个 block
                if hasattr(resp.content[0], 'text'):
                    return resp.content[0].text.strip()
                return ''
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"    [重试 {attempt+1}/{max_retries}] {e}, 等待 {wait}s...")
                time.sleep(wait)
            else:
                return json.dumps({"error": str(e)})


def generate_response(client, client_type, model, instruction, user_input):
    """向被评估模型发送角色扮演回答请求"""
    return call_llm(
        client, client_type, model,
        prompt=user_input,
        system_prompt=instruction,
        max_tokens=300,
        temperature=0.7,
    )


def judge_response(client, client_type, model, judge_prompt):
    """调用裁判模型评分"""
    raw = call_llm(
        client, client_type, model,
        prompt=judge_prompt,
        max_tokens=4000,  # 需要足够空间（thinking 消耗 token）
        temperature=0.0,
    )
    return parse_judge_output(raw)


def parse_judge_output(raw_text):
    """从裁判回答中提取结构化评分"""
    # 尝试直接解析 JSON
    try:
        # 处理可能的 markdown code block 包裹
        text = raw_text.strip()
        if text.startswith('```'):
            # 去掉 ```json 和 ```
            lines = text.split('\n')
            json_lines = []
            in_block = False
            for line in lines:
                if line.strip().startswith('```') and not in_block:
                    in_block = True
                    continue
                elif line.strip() == '```' and in_block:
                    break
                elif in_block:
                    json_lines.append(line)
            text = '\n'.join(json_lines)

        data = json.loads(text)

        # 验证字段
        result = {
            'ocean_score': _clamp_score(data.get('ocean_score')),
            'emotion_score': _clamp_score(data.get('emotion_score')),
            'specificity_score': _clamp_score(data.get('specificity_score')),
            'ocean_reasoning': data.get('ocean_reasoning', ''),
            'emotion_reasoning': data.get('emotion_reasoning', ''),
            'specificity_reasoning': data.get('specificity_reasoning', ''),
        }

        # 计算加权总分
        result['overall_weighted'] = round(
            result['ocean_score'] * 0.40 +
            result['emotion_score'] * 0.45 +
            result['specificity_score'] * 0.15,
            2
        )
        return result

    except (json.JSONDecodeError, KeyError, TypeError) as e:
        # 回退：尝试从文本中提取数字
        scores = re.findall(r'(\w+_score)\s*[:\=]\s*(\d)', raw_text)
        if scores:
            result = {k: _clamp_score(int(v)) for k, v in scores}
            if all(k in result for k in ('ocean_score', 'emotion_score', 'specificity_score')):
                result['overall_weighted'] = round(
                    result['ocean_score'] * 0.40 +
                    result['emotion_score'] * 0.45 +
                    result['specificity_score'] * 0.15,
                    2
                )
                result['raw'] = raw_text[:200]
                return result

        return {
            'ocean_score': 0, 'emotion_score': 0, 'specificity_score': 0,
            'overall_weighted': 0,
            'parse_error': str(e),
            'raw': raw_text[:500],
        }


def _clamp_score(val):
    """将分数限制到 [1, 5] 整数"""
    if val is None:
        return 3  # 默认中间值
    try:
        s = int(float(val))
        return max(1, min(5, s))
    except (ValueError, TypeError):
        return 3


# ═══════════════════════════════════════════════════════════════════
# 评估流程
# ═══════════════════════════════════════════════════════════════════

def load_jsonl(path):
    """加载 JSONL 文件"""
    items = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                items.append(json.loads(line))
    return items


def run_standard_eval(args):
    """标准评估：模型生成回答 + 裁判评分"""
    # 加载评估基准
    benchmark_path = args.benchmark
    if not os.path.exists(benchmark_path):
        print(f"错误: 评估基准文件不存在: {benchmark_path}")
        print("请先运行: python3 fine_tune_enhanced.py 重新生成评估基准")
        sys.exit(1)

    samples = load_jsonl(benchmark_path)
    print(f"加载评估基准: {len(samples)} 条")

    # 按类型过滤
    if args.test_type:
        samples = [s for s in samples if s['test_type'] == args.test_type]
        print(f"  过滤后 ({args.test_type}): {len(samples)} 条")

    # 限制数量
    if args.max_samples and len(samples) > args.max_samples:
        samples = samples[:args.max_samples]
        print(f"  限制为前 {args.max_samples} 条")

    # 检查是否有 ground_truth 字段（新版基准）
    has_gt = any('ground_truth' in s for s in samples)
    if not has_gt:
        print("\n⚠ 警告: 评估基准缺少 ground_truth 字段（完整心理参数）。")
        print("  裁判将仅依赖 instruction 中的信息评分，精度会降低。")
        print("  建议重新运行 fine_tune_enhanced.py 生成新版基准。\n")

    # 创建客户端
    print(f"\n目标模型: {args.model} ({args.backend})")
    print(f"裁判模型: {args.judge_model} ({args.judge_backend})")

    target_client, target_type = create_client(args.backend, args.base_url, args.api_key)
    judge_client, judge_type = create_client(
        args.judge_backend, args.judge_base_url, args.judge_api_key
    )

    # 隔离验证：裁判和目标必须不同
    if args.model == args.judge_model and args.backend == args.judge_backend:
        print("\n⚠ 警告: 目标模型和裁判模型相同！建议使用不同模型以确保评估独立性。\n")

    results = defaultdict(lambda: {
        'scores': [], 'ocean_scores': [], 'emotion_scores': [],
        'specificity_scores': [], 'count': 0, 'errors': 0,
    })

    print(f"\n{'='*60}")
    print(f"  开始评估: {len(samples)} 条样本")
    print(f"{'='*60}\n")

    t0 = time.time()
    detailed_results = []

    for i, item in enumerate(samples):
        ttype = item['test_type']
        instruction = item.get('instruction', '')
        user_input = item.get('input', '')

        # 1. 向目标模型获取回答
        response = generate_response(
            target_client, target_type, args.model, instruction, user_input
        )

        if not response or response.startswith('[ERROR') or response.startswith('{"error"'):
            results[ttype]['errors'] += 1
            detailed_results.append({
                'test_type': ttype, 'error': f'生成失败: {response[:100]}',
                'metadata': item.get('metadata', {}),
            })
            continue

        # 2. 构造裁判 prompt
        judge_prompt = build_judge_prompt(item, response)

        # 3. 裁判评分
        scores = judge_response(judge_client, judge_type, args.judge_model, judge_prompt)

        # 4. 记录结果
        overall = scores.get('overall_weighted', 0)
        results[ttype]['scores'].append(overall)
        results[ttype]['ocean_scores'].append(scores.get('ocean_score', 3))
        results[ttype]['emotion_scores'].append(scores.get('emotion_score', 3))
        results[ttype]['specificity_scores'].append(scores.get('specificity_score', 3))
        results[ttype]['count'] += 1

        detailed_results.append({
            'test_type': ttype,
            'instruction': instruction[:200],
            'input': user_input,
            'model_response': response[:500],
            'scores': scores,
            'metadata': item.get('metadata', {}),
        })

        # 进度
        if (i + 1) % 10 == 0 or (i + 1) == len(samples):
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            eta = (len(samples) - i - 1) / rate if rate > 0 else 0
            avg_overall = sum(d['scores'].get('overall_weighted', 0)
                              for d in detailed_results if 'scores' in d) / max(1, i + 1 - results[ttype]['errors'])
            print(f"  [{i+1}/{len(samples)}] {rate:.1f}/s | ETA {eta:.0f}s | "
                  f"平均 {avg_overall:.2f}/5.00 | errors={sum(r['errors'] for r in results.values())}")

        # 速率限制
        time.sleep(0.15)

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"  评估完成: {elapsed:.1f}s")
    print(f"{'='*60}\n")

    # 打印结果
    print_results(results)

    # 保存详细结果
    save_results(results, detailed_results, args)

    return results


def run_train_eval(args):
    """评估训练数据质量（用已有 output）"""
    train_path = args.train_data
    if not train_path or not os.path.exists(train_path):
        print(f"错误: 训练数据不存在: {train_path}")
        sys.exit(1)

    samples = load_jsonl(train_path)
    print(f"加载训练数据: {len(samples)} 条")

    # 按类型过滤
    if args.test_type:
        samples = [s for s in samples if s.get('metadata', {}).get('type') == args.test_type]
        print(f"  过滤后 ({args.test_type}): {len(samples)} 条")

    # 限制数量
    if args.max_samples and len(samples) > args.max_samples:
        samples = samples[:args.max_samples]
        print(f"  限制为前 {args.max_samples} 条")

    # 创建裁判客户端
    print(f"\n裁判模型: {args.judge_model} ({args.judge_backend})")
    judge_client, judge_type = create_client(
        args.judge_backend, args.judge_base_url, args.judge_api_key
    )

    results = defaultdict(lambda: {
        'scores': [], 'ocean_scores': [], 'emotion_scores': [],
        'specificity_scores': [], 'count': 0, 'errors': 0,
    })

    print(f"\n{'='*60}")
    print(f"  开始评估训练数据质量: {len(samples)} 条样本")
    print(f"{'='*60}\n")

    t0 = time.time()
    detailed_results = []

    for i, item in enumerate(samples):
        ttype = item.get('metadata', {}).get('type', 'unknown')

        # 构造裁判 prompt（直接评估已有 output）
        judge_prompt = build_judge_prompt_from_train(item)

        # 裁判评分
        scores = judge_response(judge_client, judge_type, args.judge_model, judge_prompt)

        overall = scores.get('overall_weighted', 0)
        results[ttype]['scores'].append(overall)
        results[ttype]['ocean_scores'].append(scores.get('ocean_score', 3))
        results[ttype]['emotion_scores'].append(scores.get('emotion_score', 3))
        results[ttype]['specificity_scores'].append(scores.get('specificity_score', 3))
        results[ttype]['count'] += 1

        detailed_results.append({
            'type': ttype,
            'instruction': item.get('instruction', '')[:200],
            'input': item.get('input', ''),
            'output': item.get('output', '')[:300],
            'scores': scores,
            'metadata': item.get('metadata', {}),
        })

        # 进度
        if (i + 1) % 10 == 0 or (i + 1) == len(samples):
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            eta = (len(samples) - i - 1) / rate if rate > 0 else 0
            n_scored = sum(1 for d in detailed_results if 'scores' in d)
            avg = sum(d['scores'].get('overall_weighted', 0) for d in detailed_results if 'scores' in d) / max(1, n_scored)
            print(f"  [{i+1}/{len(samples)}] {rate:.1f}/s | ETA {eta:.0f}s | 平均 {avg:.2f}/5.00")

        time.sleep(0.15)

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"  评估完成: {elapsed:.1f}s")
    print(f"{'='*60}\n")

    print_results(results, title_prefix="训练数据质量")
    save_results(results, detailed_results, args, prefix='train_eval')

    return results


# ═══════════════════════════════════════════════════════════════════
# 结果输出
# ═══════════════════════════════════════════════════════════════════

TYPE_NAMES = {
    'valence_consistency': '效价一致性',
    'personality_consistency': '人格一致性',
    'emotion_change_tracking': '情绪变化追踪',
    'emotion': '情绪状态',
    'social': '社交关系',
    'event': '事件反应',
    'personality': '人格测试',
    'reflection': '自我反思',
    'change': '情绪变化',
    'unknown': '未分类',
}


def print_results(results, title_prefix="评估"):
    """打印评估结果"""
    print(f"{'='*60}")
    print(f"  {title_prefix}结果")
    print(f"{'='*60}")

    all_ocean, all_emotion, all_specificity, all_overall = [], [], [], []

    for ttype, data in results.items():
        n = data['count']
        if n == 0:
            continue

        name = TYPE_NAMES.get(ttype, ttype)
        avg_ocean = sum(data['ocean_scores']) / n
        avg_emotion = sum(data['emotion_scores']) / n
        avg_spec = sum(data['specificity_scores']) / n
        avg_overall = sum(data['scores']) / n

        all_ocean.extend(data['ocean_scores'])
        all_emotion.extend(data['emotion_scores'])
        all_specificity.extend(data['specificity_scores'])
        all_overall.extend(data['scores'])

        print(f"\n  [{name}] ({n} 条, {data['errors']} 错误)")
        print(f"    OCEAN 服从度:  {avg_ocean:.2f}/5  (40%)")
        print(f"    情绪轨迹对齐:  {avg_emotion:.2f}/5  (45%)")
        print(f"    状态锚定度:    {avg_spec:.2f}/5  (15%)")
        print(f"    加权总分:      {avg_overall:.2f}/5")

        # 分数分布
        score_dist = defaultdict(int)
        for s in data['scores']:
            bucket = round(s, 0)
            score_dist[bucket] += 1
        dist_str = " | ".join(f"{k:.0f}分:{v}" for k, v in sorted(score_dist.items()))
        print(f"    分布: {dist_str}")

    if all_overall:
        n = len(all_overall)
        print(f"\n{'─'*60}")
        print(f"  总计 ({n} 条)")
        print(f"    OCEAN 服从度:  {sum(all_ocean)/n:.2f}/5")
        print(f"    情绪轨迹对齐:  {sum(all_emotion)/n:.2f}/5")
        print(f"    状态锚定度:    {sum(all_specificity)/n:.2f}/5")
        print(f"    加权总分:      {sum(all_overall)/n:.2f}/5")
        print(f"{'='*60}")


def save_results(results, detailed_results, args, prefix='eval'):
    """保存详细结果"""
    # 确定输出目录
    benchmark_dir = Path(args.benchmark).parent if hasattr(args, 'benchmark') else Path('.')
    out_dir = benchmark_dir

    # 汇总
    summary = {
        'mode': args.mode,
        'model': args.model,
        'backend': args.backend,
        'judge_model': args.judge_model,
        'judge_backend': args.judge_backend,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'num_samples': sum(d['count'] for d in results.values()),
        'rubric': {
            'ocean_compliance': {'weight': 0.40, 'scale': '1-5'},
            'emotion_trajectory': {'weight': 0.45, 'scale': '1-5'},
            'state_specificity': {'weight': 0.15, 'scale': '1-5'},
        },
        'by_type': {},
    }

    for ttype, data in results.items():
        n = data['count']
        if n == 0:
            continue
        summary['by_type'][ttype] = {
            'count': n,
            'errors': data['errors'],
            'avg_ocean': round(sum(data['ocean_scores']) / n, 3),
            'avg_emotion': round(sum(data['emotion_scores']) / n, 3),
            'avg_specificity': round(sum(data['specificity_scores']) / n, 3),
            'avg_overall': round(sum(data['scores']) / n, 3),
        }

    # 保存汇总
    summary_path = out_dir / f'{prefix}_summary.json'
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"\n汇总: {summary_path}")

    # 保存详细结果
    detail_path = out_dir / f'{prefix}_details.jsonl'
    with open(detail_path, 'w', encoding='utf-8') as f:
        for d in detailed_results:
            f.write(json.dumps(d, ensure_ascii=False) + '\n')
    print(f"详细: {detail_path}")


# ═══════════════════════════════════════════════════════════════════
# 入口
# ═══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description='Andy Engine 角色一致性评估 (LLM-as-Judge)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
评估维度:
  OCEAN 人格服从度  (40%) — 回答是否正确反映五大人格特征
  情绪轨迹对齐度    (45%) — 回答是否与当前多维情绪状态一致
  状态锚定度        (15%) — 回答是否引用具体心理参数

示例:
  python3 eval_runner.py --backend openai --model gpt-4o-mini
  python3 eval_runner.py --mode train_eval --train-data training_data_v2/train.jsonl --max-samples 50
  python3 eval_runner.py --judge-backend anthropic --judge-model claude-sonnet-4-20250514
        """
    )

    # 模式
    parser.add_argument('--mode', choices=['standard', 'train_eval'], default='standard',
                        help='standard=模型生成+裁判评分, train_eval=评估已有训练数据')

    # 评估基准
    parser.add_argument('--benchmark', default='data_generator/training_data_v2/eval_benchmark.jsonl',
                        help='评估基准文件路径 (standard 模式)')
    parser.add_argument('--train-data', default=None,
                        help='训练数据路径 (train_eval 模式)')
    parser.add_argument('--test-type', default=None,
                        help='只评估特定测试类型')

    # 目标模型
    parser.add_argument('--backend', choices=['openai', 'anthropic', 'local'], default='openai',
                        help='目标模型后端')
    parser.add_argument('--model', default='gpt-4o-mini',
                        help='目标模型名称')
    parser.add_argument('--base-url', default=None,
                        help='API base URL (local 后端)')
    parser.add_argument('--api-key', default=None,
                        help='API key')

    # 裁判模型
    parser.add_argument('--judge-backend', default=None,
                        help='裁判模型后端 (默认同 target)')
    parser.add_argument('--judge-model', default='gpt-4o',
                        help='裁判模型名称 (建议顶级模型)')
    parser.add_argument('--judge-base-url', default=None,
                        help='裁判 API base URL')
    parser.add_argument('--judge-api-key', default=None,
                        help='裁判 API key')

    # 控制
    parser.add_argument('--max-samples', type=int, default=None,
                        help='最大评估样本数 (调试用)')

    args = parser.parse_args()

    # 默认裁判后端同目标
    if args.judge_backend is None:
        args.judge_backend = args.backend

    # 打印配置
    print(f"\n╔═══════════════════════════════════════════════════════╗")
    print(f"║  Andy Engine 角色一致性评估 (LLM-as-Judge)           ║")
    print(f"╠═══════════════════════════════════════════════════════╣")
    print(f"║  模式:  {args.mode:20s}                         ║")
    print(f"║  目标:  {args.model:20s} ({args.backend:10s})  ║")
    print(f"║  裁判:  {args.judge_model:20s} ({args.judge_backend:10s})  ║")
    print(f"╠═══════════════════════════════════════════════════════╣")
    print(f"║  量规: OCEAN 40% + 情绪轨迹 45% + 锚定度 15%        ║")
    print(f"║  刻度: 1-5 分制                                      ║")
    print(f"╚═══════════════════════════════════════════════════════╝\n")

    if args.mode == 'standard':
        run_standard_eval(args)
    elif args.mode == 'train_eval':
        run_train_eval(args)


if __name__ == '__main__':
    main()
