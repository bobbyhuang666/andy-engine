#!/usr/bin/env python3
"""
Andy Engine State-to-Text 管线验证（4 阶段闭环）

阶段 1: 提取 2000 条极值样本（从 68K 训练数据中筛选极端效价）
阶段 2: 格式对齐（Alpaca → ChatML messages 格式）
阶段 3: LoRA 微调（Apple M1 MPS / CUDA / CPU）
阶段 4: LLM-as-Judge 评测（Anthropic API）

用法:
    # 全链路
    python3 run_pipeline.py --all

    # 单阶段
    python3 run_pipeline.py --stage 1   # 只提取
    python3 run_pipeline.py --stage 2   # 只格式化
    python3 run_pipeline.py --stage 3   # 只微调
    python3 run_pipeline.py --stage 4   # 只评测

    # 指定模型（默认 Qwen2.5-0.5B-Instruct，适合 M1 快速验证）
    python3 run_pipeline.py --all --base-model Qwen/Qwen2.5-0.5B-Instruct

    # 跳过下载（如果模型已缓存）
    python3 run_pipeline.py --stage 3 --no-download
"""

import json
import os
import sys
import time
import argparse
import struct
from pathlib import Path
from collections import Counter, defaultdict

# ═══════════════════════════════════════════
# 常量
# ═══════════════════════════════════════════

PIPELINE_DIR = Path(__file__).parent
DATA_DIR = PIPELINE_DIR / 'pipeline_data'
STAGE1_DIR = DATA_DIR / 'stage1_extracted'
STAGE2_DIR = DATA_DIR / 'stage2_chatml'
STAGE3_DIR = DATA_DIR / 'stage3_lora_output'
STAGE4_DIR = DATA_DIR / 'stage4_eval_results'

KEY_DIM_NAMES = ['joy', 'sadness', 'anger', 'fear', 'nervousness', 'boredom', 'calm', 'frustration']
OCEAN_DIMS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']

# 极值阈值
VALENCE_POS_THRESHOLD = 0.08    # 正面极值
VALENCE_NEG_THRESHOLD = -0.02   # 负面极值
TARGET_SAMPLES = 2000


# ═══════════════════════════════════════════
# 阶段 1: 提取极值样本
# ═══════════════════════════════════════════

def stage1_extract():
    """从训练数据中提取 2000 条极值样本，补充完整心理参数"""
    print("\n" + "="*60)
    print("  阶段 1/4: 提取极值样本")
    print("="*60)

    train_path = PIPELINE_DIR / 'training_data_v2' / 'train.jsonl'
    if not train_path.exists():
        print(f"错误: 训练数据不存在: {train_path}")
        sys.exit(1)

    # 加载所有训练样本
    print(f"加载训练数据: {train_path}")
    all_samples = []
    with open(train_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                all_samples.append(json.loads(line))
    print(f"  总样本数: {len(all_samples)}")

    # 统计 valence 分布
    valences = [s['metadata'].get('valence', 0) for s in all_samples]
    pos_count = sum(1 for v in valences if v > VALENCE_POS_THRESHOLD)
    neg_count = sum(1 for v in valences if v < VALENCE_NEG_THRESHOLD)
    print(f"  正面极值 (>{VALENCE_POS_THRESHOLD}): {pos_count} 条")
    print(f"  负面极值 (<{VALENCE_NEG_THRESHOLD}): {neg_count} 条")

    # 筛选极值样本
    extreme = [s for s in all_samples
               if s['metadata'].get('valence', 0) > VALENCE_POS_THRESHOLD
               or s['metadata'].get('valence', 0) < VALENCE_NEG_THRESHOLD]
    print(f"  筛选后: {len(extreme)} 条")

    # 如果不够，降低阈值
    if len(extreme) < TARGET_SAMPLES:
        sorted_by_val = sorted(all_samples, key=lambda s: abs(s['metadata'].get('valence', 0)), reverse=True)
        extreme = sorted_by_val[:TARGET_SAMPLES]
        print(f"  补充到: {len(extreme)} 条（按 |valence| 排序取前 {TARGET_SAMPLES}）")

    # 如果超过目标，按多样性采样（分层：正/负 × 类型）
    if len(extreme) > TARGET_SAMPLES:
        random.seed(42)
        # 分层采样
        by_bucket = defaultdict(list)
        for s in extreme:
            v = s['metadata'].get('valence', 0)
            direction = 'pos' if v > 0 else 'neg'
            qtype = s['metadata'].get('type', 'unknown')
            by_bucket[(direction, qtype)].append(s)

        sampled = []
        per_bucket = max(1, TARGET_SAMPLES // len(by_bucket))
        for bucket, items in by_bucket.items():
            random.shuffle(items)
            sampled.extend(items[:per_bucket])

        # 补齐
        if len(sampled) < TARGET_SAMPLES:
            remaining = [s for s in extreme if s not in sampled]
            random.shuffle(remaining)
            sampled.extend(remaining[:TARGET_SAMPLES - len(sampled)])

        extreme = sampled[:TARGET_SAMPLES]

    # 从原始场景数据补充 emotion_dims（8 维）
    print(f"\n补充 8 维情绪向量...")
    extreme = enrich_with_emotion_dims(extreme)

    # 统计
    type_dist = Counter(s['metadata'].get('type', 'unknown') for s in extreme)
    mbti_dist = Counter(s['metadata'].get('mbti', '?') for s in extreme)
    val_dist = {'pos': 0, 'neg': 0, 'neutral': 0}
    for s in extreme:
        v = s['metadata'].get('valence', 0)
        if v > 0.03: val_dist['pos'] += 1
        elif v < -0.02: val_dist['neg'] += 1
        else: val_dist['neutral'] += 1

    print(f"\n  最终样本数: {len(extreme)}")
    print(f"  效价分布: 正面={val_dist['pos']} 负面={val_dist['neg']} 中性={val_dist['neutral']}")
    print(f"  类型分布: {dict(type_dist)}")

    # 保存
    STAGE1_DIR.mkdir(parents=True, exist_ok=True)
    out_path = STAGE1_DIR / 'extreme_samples.jsonl'
    with open(out_path, 'w', encoding='utf-8') as f:
        for s in extreme:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print(f"\n  输出: {out_path}")

    # 保存统计
    stats = {
        'total': len(extreme),
        'valence_distribution': val_dist,
        'type_distribution': dict(type_dist),
        'mbti_distribution': dict(mbti_dist),
        'valence_stats': {
            'mean': sum(s['metadata'].get('valence', 0) for s in extreme) / len(extreme),
            'min': min(s['metadata'].get('valence', 0) for s in extreme),
            'max': max(s['metadata'].get('valence', 0) for s in extreme),
        }
    }
    with open(STAGE1_DIR / 'stats.json', 'w') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    return extreme


def enrich_with_emotion_dims(samples):
    """为训练样本补充 8 维情绪向量（从原始 .f32 文件提取）"""
    # 按场景分组
    by_scenario = defaultdict(list)
    for i, s in enumerate(samples):
        scenario = s['metadata'].get('scenario', '')
        by_scenario[scenario].append(i)

    output_dir = PIPELINE_DIR / 'output'
    enriched = list(samples)  # copy

    for scenario, indices in by_scenario.items():
        scenario_dir = output_dir / scenario
        f32_path = scenario_dir / 'emotion_data.f32'
        agents_path = scenario_dir / 'agents.json'

        if not f32_path.exists() or not agents_path.exists():
            # 没有原始数据，用默认零值
            for idx in indices:
                enriched[idx]['metadata']['emotion_dims'] = [0.0] * 8
            continue

        # 加载 .f32
        with open(f32_path, 'rb') as f:
            header = struct.unpack('<4I', f.read(16))
            n_agents, n_snaps, fpa, interval = header
            f.read(16)
            data = f.read()
        floats = struct.unpack(f'<{len(data)//4}f', data)

        # 加载 agents
        with open(agents_path) as f:
            agents_info = json.load(f)

        # 建立 agent_id → index 映射
        agent_id_to_idx = {a['id']: i for i, a in enumerate(agents_info)}

        for idx in indices:
            s = samples[idx]
            agent_id = s['metadata'].get('agent_id', '')
            day = s['metadata'].get('day', 1)

            agent_idx = agent_id_to_idx.get(agent_id)
            if agent_idx is None or agent_idx >= n_agents:
                enriched[idx]['metadata']['emotion_dims'] = [0.0] * 8
                continue

            # 计算 snap_idx（day → snap）
            snap_idx = min((day * 288) // interval - 1, n_snaps - 1)
            snap_idx = max(0, snap_idx)

            off = (snap_idx * n_agents + agent_idx) * fpa
            snap = floats[off:off + fpa]

            # snap[2:10] = 8 KEY_DIMS
            dims = [snap[2 + k] for k in range(min(8, fpa - 2))]
            enriched[idx]['metadata']['emotion_dims'] = [round(d, 6) for d in dims]

    n_enriched = sum(1 for s in enriched if any(d != 0 for d in s['metadata'].get('emotion_dims', [])))
    print(f"  成功补充情绪向量: {n_enriched}/{len(samples)} 条")
    return enriched


# ═══════════════════════════════════════════
# 阶段 2: 格式对齐（Alpaca → ChatML）
# ═══════════════════════════════════════════

def stage2_format(samples=None):
    """将 Alpaca 格式转为 ChatML messages 格式（适配 trl SFTTrainer）"""
    print("\n" + "="*60)
    print("  阶段 2/4: 格式对齐（Alpaca → ChatML）")
    print("="*60)

    if samples is None:
        path = STAGE1_DIR / 'extreme_samples.jsonl'
        if not path.exists():
            print(f"错误: 阶段 1 输出不存在: {path}")
            print("请先运行: python3 run_pipeline.py --stage 1")
            sys.exit(1)
        samples = []
        with open(path, 'r') as f:
            for line in f:
                if line.strip():
                    samples.append(json.loads(line))

    print(f"输入样本: {len(samples)} 条")

    # 转换为 ChatML messages 格式
    chatml_samples = []
    for s in samples:
        instruction = s.get('instruction', '')
        user_input = s.get('input', '')
        output = s.get('output', '')

        # 组合 system + user
        messages = [
            {"role": "system", "content": instruction},
            {"role": "user", "content": user_input},
            {"role": "assistant", "content": output},
        ]

        chatml_sample = {
            "messages": messages,
            # 保留元数据用于评测
            "metadata": s.get('metadata', {}),
        }
        chatml_samples.append(chatml_sample)

    # 训练/验证/测试切分 (80/10/10)
    import random
    random.seed(42)
    random.shuffle(chatml_samples)

    n = len(chatml_samples)
    n_train = int(n * 0.8)
    n_val = int(n * 0.1)

    train_set = chatml_samples[:n_train]
    val_set = chatml_samples[n_train:n_train + n_val]
    test_set = chatml_samples[n_train + n_val:]

    STAGE2_DIR.mkdir(parents=True, exist_ok=True)

    for name, dataset in [('train', train_set), ('val', val_set), ('test', test_set)]:
        out_path = STAGE2_DIR / f'{name}.jsonl'
        with open(out_path, 'w', encoding='utf-8') as f:
            for s in dataset:
                f.write(json.dumps(s, ensure_ascii=False) + '\n')
        print(f"  {name}: {len(dataset)} 条 → {out_path}")

    # 同时保存纯 messages 格式（给 trl 用）
    for name, dataset in [('train', train_set), ('val', val_set)]:
        out_path = STAGE2_DIR / f'{name}_messages.jsonl'
        with open(out_path, 'w', encoding='utf-8') as f:
            for s in dataset:
                f.write(json.dumps({"messages": s["messages"]}, ensure_ascii=False) + '\n')

    # 保存 test set 的 ground truth 用于评测
    test_gt_path = STAGE2_DIR / 'test_ground_truth.jsonl'
    with open(test_gt_path, 'w', encoding='utf-8') as f:
        for s in test_set:
            gt = {
                "system": s["messages"][0]["content"],
                "user": s["messages"][1]["content"],
                "expected": s["messages"][2]["content"],
                "metadata": s.get("metadata", {}),
            }
            f.write(json.dumps(gt, ensure_ascii=False) + '\n')

    print(f"\n  切分: train={len(train_set)} val={len(val_set)} test={len(test_set)}")
    return train_set, val_set, test_set


# ═══════════════════════════════════════════
# 阶段 3: LoRA 微调
# ═══════════════════════════════════════════

def stage3_finetune(args):
    """LoRA 微调小模型"""
    print("\n" + "="*60)
    print("  阶段 3/4: LoRA 微调")
    print("="*60)

    import torch
    from datasets import load_dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig, get_peft_model, TaskType
    from trl import SFTTrainer, SFTConfig

    model_name = args.base_model
    print(f"  基座模型: {model_name}")
    print(f"  设备: {'MPS' if torch.backends.mps.is_available() else 'CUDA' if torch.cuda.is_available() else 'CPU'}")

    # 检查是否有 MPS 或 CUDA
    if torch.backends.mps.is_available():
        device_map = "mps"
    elif torch.cuda.is_available():
        device_map = "auto"
    else:
        device_map = "cpu"

    # 加载 tokenizer
    print("  加载 tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 加载模型
    print("  加载模型（这可能需要几分钟）...")
    try:
        # 尝试 4-bit 量化（节省内存）
        from transformers import BitsAndBytesConfig
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            quantization_config=bnb_config,
            device_map=device_map,
            trust_remote_code=True,
            torch_dtype=torch.float16,
        )
        print("  使用 4-bit QLoRA")
    except Exception as e:
        print(f"  4-bit 量化失败 ({e})，使用 FP32")
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            device_map=device_map,
            trust_remote_code=True,
        )

    model.config.use_cache = False

    # LoRA 配置
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=16,                  # rank
        lora_alpha=32,         # scaling
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        bias="none",
    )

    model = get_peft_model(model, lora_config)
    trainable, total = model.get_nb_trainable_parameters()
    print(f"  LoRA 参数: {trainable:,} / {total:,} ({100*trainable/total:.2f}%)")

    # 加载训练数据
    train_path = STAGE2_DIR / 'train_messages.jsonl'
    val_path = STAGE2_DIR / 'val_messages.jsonl'

    if not train_path.exists():
        print(f"错误: 训练数据不存在: {train_path}")
        print("请先运行: python3 run_pipeline.py --stage 2")
        sys.exit(1)

    dataset = load_dataset('json', data_files={
        'train': str(train_path),
        'validation': str(val_path),
    })

    print(f"  训练集: {len(dataset['train'])} 条")
    print(f"  验证集: {len(dataset['validation'])} 条")

    # 训练参数（M1 优化）
    STAGE3_DIR.mkdir(parents=True, exist_ok=True)
    epochs = args.epochs
    batch_size = args.batch_size
    lr = args.learning_rate

    print(f"  epochs={epochs} batch_size={batch_size} lr={lr}")

    training_args = SFTConfig(
        output_dir=str(STAGE3_DIR),
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        gradient_accumulation_steps=4,
        learning_rate=lr,
        weight_decay=0.01,
        warmup_steps=50,
        lr_scheduler_type="cosine",
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=50,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=3,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        report_to="none",
        fp16=False,  # M1 MPS 不支持 fp16 训练
        bf16=torch.backends.mps.is_available(),
        dataloader_pin_memory=False,
        remove_unused_columns=False,
        max_grad_norm=1.0,
        max_length=512,
        dataset_text_field=None,
    )

    # Trainer
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset['train'],
        eval_dataset=dataset['validation'],
        processing_class=tokenizer,
    )

    # 开始训练
    print("\n  开始训练...")
    t0 = time.time()
    train_result = trainer.train()
    elapsed = time.time() - t0

    # 保存
    print(f"\n  训练完成: {elapsed:.0f}s")
    print(f"  最终 train loss: {train_result.training_loss:.4f}")

    # 保存 LoRA 权重
    lora_path = STAGE3_DIR / 'lora_weights'
    model.save_pretrained(str(lora_path))
    tokenizer.save_pretrained(str(lora_path))
    print(f"  LoRA 权重已保存: {lora_path}")

    # 保存训练日志
    log_path = STAGE3_DIR / 'training_log.json'
    log_data = {
        'model': model_name,
        'lora_r': 16,
        'lora_alpha': 32,
        'epochs': epochs,
        'batch_size': batch_size,
        'learning_rate': lr,
        'final_train_loss': train_result.training_loss,
        'trainable_params': trainable,
        'total_params': total,
        'elapsed_seconds': elapsed,
        'device': device_map,
    }

    # 提取 loss 曲线
    if hasattr(trainer.state, 'log_history'):
        losses = [(l.get('step'), l.get('loss'), l.get('eval_loss'))
                  for l in trainer.state.log_history
                  if 'loss' in l or 'eval_loss' in l]
        log_data['loss_curve'] = [
            {'step': s, 'train_loss': t, 'eval_loss': e}
            for s, t, e in losses
        ]

    with open(log_path, 'w') as f:
        json.dump(log_data, f, indent=2)
    print(f"  训练日志: {log_path}")

    return model, tokenizer


# ═══════════════════════════════════════════
# 阶段 4: LLM-as-Judge 评测
# ═══════════════════════════════════════════

def stage4_evaluate(args):
    """用 LLM-as-Judge 评估微调模型 vs 基座模型"""
    print("\n" + "="*60)
    print("  阶段 4/4: LLM-as-Judge 评测")
    print("="*60)

    import anthropic

    # 加载 test set
    test_path = STAGE2_DIR / 'test_ground_truth.jsonl'
    if not test_path.exists():
        print(f"错误: 测试集不存在: {test_path}")
        print("请先运行: python3 run_pipeline.py --stage 2")
        sys.exit(1)

    test_set = []
    with open(test_path) as f:
        for line in f:
            if line.strip():
                test_set.append(json.loads(line))

    print(f"测试集: {len(test_set)} 条")

    if args.max_eval_samples:
        test_set = test_set[:args.max_eval_samples]
        print(f"  限制为: {args.max_eval_samples} 条")

    # ── 生成基座模型回答 ──
    base_responses = generate_model_responses(
        test_set, args.base_model, args, label="基座模型"
    )

    # 清理基座模型，释放内存给微调模型
    import gc
    gc.collect()
    try:
        import torch
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
    except:
        pass
    print("  ✓ 基座模型已卸载，内存已清理")

    # ── 生成微调模型回答（如果 LoRA 权重存在）──
    ft_responses = None
    lora_path = STAGE3_DIR / 'lora_weights'
    if lora_path.exists() and not args.skip_ft_eval:
        ft_responses = generate_ft_model_responses(
            test_set, args.base_model, str(lora_path), args, label="微调模型"
        )
        # 清理微调模型
        gc.collect()
        try:
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
        except:
            pass
        print("  ✓ 微调模型已卸载，内存已清理")

    # ── 裁判评分 ──
    api_key = args.anthropic_key or os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("错误: 需要 ANTHROPIC_API_KEY")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    judge_model = args.judge_model
    STAGE4_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n裁判模型: {judge_model}")

    # 检查已有 checkpoint
    checkpoint_path = STAGE4_DIR / 'checkpoint.json'
    checkpoint = {}
    if checkpoint_path.exists():
        with open(checkpoint_path) as f:
            checkpoint = json.load(f)
        print(f"  发现 checkpoint，已有 {len(checkpoint)} 项")

    # 评估基座模型回答
    base_scores = None
    if 'base_scores' in checkpoint and not args.force_rerun:
        base_scores = checkpoint['base_scores']
        print(f"\n── 基座模型（从 checkpoint 加载）──")
        print_scores(base_scores)
    else:
        print(f"\n── 评估基座模型回答 ──")
        base_scores = judge_batch(client, judge_model, test_set, base_responses)
        checkpoint['base_scores'] = base_scores
        with open(checkpoint_path, 'w') as f:
            json.dump(checkpoint, f, indent=2, ensure_ascii=False)
        print(f"  ✓ 基座 checkpoint 已保存")

    # 评估微调模型回答
    ft_scores = None
    if ft_responses:
        if 'ft_scores' in checkpoint and not args.force_rerun:
            ft_scores = checkpoint['ft_scores']
            print(f"\n── 微调模型（从 checkpoint 加载）──")
            print_scores(ft_scores)
        else:
            print(f"\n── 评估微调模型回答 ──")
            ft_scores = judge_batch(client, judge_model, test_set, ft_responses)
            checkpoint['ft_scores'] = ft_scores
            with open(checkpoint_path, 'w') as f:
                json.dump(checkpoint, f, indent=2, ensure_ascii=False)
            print(f"  ✓ 微调 checkpoint 已保存")

    print(f"\n{'='*60}")
    print(f"  管线验证结果")
    print(f"{'='*60}")

    print(f"\n  基座模型 ({args.base_model}):")
    print_scores(base_scores)

    if ft_scores:
        print(f"\n  微调模型 (LoRA):")
        print_scores(ft_scores)

        print(f"\n  Δ 提升:")
        base_avg = base_scores['overall_avg']
        ft_avg = ft_scores['overall_avg']
        delta = ft_avg - base_avg
        pct = (delta / base_avg * 100) if base_avg > 0 else 0
        print(f"    加权总分: {base_avg:.2f} → {ft_avg:.2f} (Δ={delta:+.2f}, {pct:+.1f}%)")

        for dim in ['ocean', 'emotion', 'specificity']:
            b = base_scores[f'{dim}_avg']
            f = ft_scores[f'{dim}_avg']
            d = f - b
            print(f"    {dim}: {b:.2f} → {f:.2f} (Δ={d:+.2f})")

    # 保存
    results = {
        'base_model': args.base_model,
        'judge_model': judge_model,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'num_test_samples': len(test_set),
        'base_scores': base_scores,
        'ft_scores': ft_scores,
    }
    out_path = STAGE4_DIR / 'pipeline_eval.json'
    with open(out_path, 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n  结果已保存: {out_path}")

    # 保存逐条详细结果
    details = []
    for i, item in enumerate(test_set):
        d = {
            'system': item['system'][:200],
            'user': item['user'],
            'expected': item['expected'],
            'base_response': base_responses[i][:300] if i < len(base_responses) else '',
            'base_scores': base_scores['per_sample'][i] if i < len(base_scores.get('per_sample', [])) else None,
            'metadata': item.get('metadata', {}),
        }
        if ft_responses and i < len(ft_responses):
            d['ft_response'] = ft_responses[i][:300]
            if ft_scores and i < len(ft_scores.get('per_sample', [])):
                d['ft_scores'] = ft_scores['per_sample'][i]
        details.append(d)

    details_path = STAGE4_DIR / 'eval_details.jsonl'
    with open(details_path, 'w', encoding='utf-8') as f:
        for d in details:
            f.write(json.dumps(d, ensure_ascii=False) + '\n')

    return results


def generate_model_responses(test_set, model_name, args, label="模型"):
    """用 HuggingFace 模型生成回答（fp16，不用 4-bit 量化）"""
    import torch
    import gc
    from transformers import AutoModelForCausalLM, AutoTokenizer

    print(f"\n  生成 {label} 回答: {model_name}")

    device = "mps" if torch.backends.mps.is_available() else \
             "cuda" if torch.cuda.is_available() else "cpu"

    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 直接 fp16 加载（0.5B 模型 ~1GB，M1 16GB 足够）
    model = AutoModelForCausalLM.from_pretrained(
        model_name, trust_remote_code=True,
        torch_dtype=torch.float16,
    ).to(device)
    model.eval()

    responses = []
    t0 = time.time()
    for i, item in enumerate(test_set):
        messages = [
            {"role": "system", "content": item['system']},
            {"role": "user", "content": item['user']},
        ]

        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, return_tensors="pt").to(model.device)

        with torch.no_grad():
            out = model.generate(
                **inputs, max_new_tokens=200, temperature=0.7,
                do_sample=True, top_p=0.9,
                pad_token_id=tokenizer.pad_token_id,
            )

        response = tokenizer.decode(out[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
        responses.append(response.strip())

        if (i + 1) % 20 == 0:
            elapsed = time.time() - t0
            print(f"    [{i+1}/{len(test_set)}] {elapsed:.0f}s")

    print(f"    完成: {len(responses)} 条, {time.time()-t0:.0f}s")
    del model
    import gc; gc.collect()
    return responses


def generate_ft_model_responses(test_set, base_model, lora_path, args, label="微调模型"):
    """用 LoRA 微调模型生成回答（fp16，不用 4-bit 量化）"""
    import torch
    import gc
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    print(f"\n  生成 {label} 回答")

    device = "mps" if torch.backends.mps.is_available() else \
             "cuda" if torch.cuda.is_available() else "cpu"

    tokenizer = AutoTokenizer.from_pretrained(lora_path, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 直接 fp16 加载基座
    base = AutoModelForCausalLM.from_pretrained(
        base_model, trust_remote_code=True,
        torch_dtype=torch.float16,
    ).to(device)

    model = PeftModel.from_pretrained(base, lora_path)
    model.eval()

    responses = []
    t0 = time.time()
    for i, item in enumerate(test_set):
        messages = [
            {"role": "system", "content": item['system']},
            {"role": "user", "content": item['user']},
        ]

        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, return_tensors="pt").to(model.device)

        with torch.no_grad():
            out = model.generate(
                **inputs, max_new_tokens=200, temperature=0.7,
                do_sample=True, top_p=0.9,
                pad_token_id=tokenizer.pad_token_id,
            )

        response = tokenizer.decode(out[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
        responses.append(response.strip())

        if (i + 1) % 20 == 0:
            elapsed = time.time() - t0
            print(f"    [{i+1}/{len(test_set)}] {elapsed:.0f}s")

    print(f"    完成: {len(responses)} 条, {time.time()-t0:.0f}s")
    del model, base
    import gc; gc.collect()
    return responses


def judge_batch(client, model, test_set, responses):
    """批量 LLM-as-Judge 评分"""
    from eval_runner import build_judge_prompt, parse_judge_output

    per_sample = []
    ocean_sum, emotion_sum, spec_sum, overall_sum = 0, 0, 0, 0
    errors = 0

    t0 = time.time()
    for i, (item, response) in enumerate(zip(test_set, responses)):
        # 构造评估项（兼容 eval_runner 的格式）
        eval_item = {
            'instruction': item['system'],
            'input': item['user'],
            'ground_truth': item.get('metadata', {}),
        }

        # 从 metadata 提取情绪信息
        meta = item.get('metadata', {})
        if 'emotion_dims' in meta:
            eval_item['ground_truth']['emotion_dims'] = meta['emotion_dims']
        if 'valence' in meta:
            eval_item['ground_truth']['valence'] = meta['valence']
        # 提取 OCEAN（如果有）
        # 训练数据的 metadata 不直接有 OCEAN，从 instruction 解析
        ocean = parse_ocean_from_instruction(item['system'])
        if ocean:
            eval_item['ground_truth']['ocean'] = ocean

        prompt = build_judge_prompt(eval_item, response)

        # 调用裁判
        raw = client.messages.create(
            model=model,
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        # 处理 text + thinking 双块（mimo-v2.5-pro 等模型）
        raw_text = ''
        for block in raw.content:
            if block.type == 'text':
                raw_text = block.text
                break

        scores = parse_judge_output(raw_text)
        per_sample.append(scores)

        ocean_sum += scores.get('ocean_score', 3)
        emotion_sum += scores.get('emotion_score', 3)
        spec_sum += scores.get('specificity_score', 3)
        overall_sum += scores.get('overall_weighted', 3)

        if 'parse_error' in scores:
            errors += 1

        if (i + 1) % 10 == 0:
            elapsed = time.time() - t0
            avg = overall_sum / (i + 1)
            print(f"    [{i+1}/{len(test_set)}] 平均 {avg:.2f}/5 | {elapsed:.0f}s | errors={errors}")

        time.sleep(0.2)  # 速率限制

    n = len(test_set)
    return {
        'ocean_avg': ocean_sum / n,
        'emotion_avg': emotion_sum / n,
        'specificity_avg': spec_sum / n,
        'overall_avg': overall_sum / n,
        'errors': errors,
        'per_sample': per_sample,
    }


def parse_ocean_from_instruction(instruction):
    """从 instruction 文本中解析 OCEAN 参数（粗略）"""
    import re
    ocean = {}
    # 尝试从文本描述推断
    if '外向' in instruction and '健谈' in instruction:
        ocean['extraversion'] = 0.75
    elif '内向' in instruction and '安静' in instruction:
        ocean['extraversion'] = 0.25
    else:
        ocean['extraversion'] = 0.5

    if '情绪敏感' in instruction or '焦虑' in instruction:
        ocean['neuroticism'] = 0.75
    elif '情绪稳定' in instruction or '抗压' in instruction:
        ocean['neuroticism'] = 0.25
    else:
        ocean['neuroticism'] = 0.5

    if '温和友善' in instruction:
        ocean['agreeableness'] = 0.75
    elif '直率' in instruction:
        ocean['agreeableness'] = 0.25
    else:
        ocean['agreeableness'] = 0.5

    if '思维开放' in instruction or '好奇' in instruction:
        ocean['openness'] = 0.75
    elif '务实' in instruction or '保守' in instruction:
        ocean['openness'] = 0.25
    else:
        ocean['openness'] = 0.5

    if '自律' in instruction or '严谨' in instruction:
        ocean['conscientiousness'] = 0.75
    elif '随性' in instruction:
        ocean['conscientiousness'] = 0.25
    else:
        ocean['conscientiousness'] = 0.5

    return ocean


def print_scores(scores):
    """打印评分结果"""
    print(f"    OCEAN 服从度:  {scores['ocean_avg']:.2f}/5  (40%)")
    print(f"    情绪轨迹对齐:  {scores['emotion_avg']:.2f}/5  (45%)")
    print(f"    状态锚定度:    {scores['specificity_avg']:.2f}/5  (15%)")
    print(f"    加权总分:      {scores['overall_avg']:.2f}/5")
    print(f"    评分错误:      {scores['errors']}")


# ═══════════════════════════════════════════
# 入口
# ═══════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description='Andy Engine State-to-Text 管线验证',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--all', action='store_true', help='运行全部 4 个阶段')
    parser.add_argument('--stage', type=int, choices=[1, 2, 3, 4], help='运行特定阶段')

    # 阶段 3 参数
    parser.add_argument('--base-model', default='Qwen/Qwen2.5-0.5B-Instruct',
                        help='基座模型 (默认 Qwen2.5-0.5B，适合 M1 快速验证)')
    parser.add_argument('--epochs', type=int, default=3, help='训练轮数')
    parser.add_argument('--batch-size', type=int, default=2, help='批大小')
    parser.add_argument('--learning-rate', type=float, default=2e-4, help='学习率')

    # 阶段 4 参数
    parser.add_argument('--judge-model', default='mimo-v2.5-pro',
                        help='裁判模型')
    parser.add_argument('--anthropic-key', default=None, help='Anthropic API key')
    parser.add_argument('--max-eval-samples', type=int, default=None, help='最大评测样本数')
    parser.add_argument('--skip-ft-eval', action='store_true', help='跳过微调模型评测')
    parser.add_argument('--force-rerun', action='store_true', help='强制重跑（忽略 checkpoint）')

    args = parser.parse_args()

    if not args.all and args.stage is None:
        parser.print_help()
        print("\n示例: python3 run_pipeline.py --all")
        print("示例: python3 run_pipeline.py --all --base-model Qwen/Qwen2.5-1.5B-Instruct --max-eval-samples 50")
        sys.exit(0)

    print(f"\n╔═══════════════════════════════════════════════════════╗")
    print(f"║  Andy Engine State-to-Text 管线验证                   ║")
    print(f"╠═══════════════════════════════════════════════════════╣")
    print(f"║  基座: {args.base_model:40s}  ║")
    print(f"║  裁判: {args.judge_model:40s}  ║")
    print(f"║  量规: OCEAN 40% + 情绪轨迹 45% + 锚定度 15%        ║")
    print(f"╚═══════════════════════════════════════════════════════╝")

    t0 = time.time()

    if args.all or args.stage == 1:
        samples = stage1_extract()
    else:
        samples = None

    if args.all or args.stage == 2:
        stage2_format(samples)

    if args.all or args.stage == 3:
        stage3_finetune(args)

    if args.all or args.stage == 4:
        stage4_evaluate(args)

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"  管线完成: {elapsed:.0f}s ({elapsed/60:.1f} min)")
    print(f"{'='*60}")


if __name__ == '__main__':
    import random
    random.seed(42)
    main()
