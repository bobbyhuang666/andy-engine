#!/bin/bash
# Andy Engine 过夜数据生成 - 守护脚本
# 每 5 分钟检查一次，如果进程挂了就重启
# 用法: bash data_generator/watchdog.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCRIPT="$SCRIPT_DIR/run_overnight.js"
LOG="$SCRIPT_DIR/overnight_stdout.log"
WATCHDOG_LOG="$SCRIPT_DIR/watchdog.log"
MAX_RESTARTS=20
restart_count=0

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$WATCHDOG_LOG"
}

log "守护脚本启动，最多重启 $MAX_RESTARTS 次"

while [ $restart_count -lt $MAX_RESTARTS ]; do
    # 检查汇总文件是否已存在（全部完成）
    SUMMARY="$SCRIPT_DIR/output/overnight_summary.json"
    if [ -f "$SUMMARY" ]; then
        # 检查汇总中的总耗时是否 > 0（排除旧的失败汇总）
        if python3 -c "import json; d=json.load(open('$SUMMARY')); exit(0 if float(d.get('totalElapsed','0'))>1 else 1)" 2>/dev/null; then
            log "✅ 全部完成！汇总文件已存在"
            break
        fi
    fi

    # 检查是否还有进程在跑
    PID=$(pgrep -f "node.*run_overnight.js" 2>/dev/null | head -1)

    if [ -n "$PID" ]; then
        # 进程在跑，等 5 分钟再检查
        log "进程 PID=$PID 运行中，等待 5 分钟..."
        sleep 300
        continue
    fi

    # 进程不在了，检查日志看是否完成了
    LAST_LINE=$(tail -1 "$LOG" 2>/dev/null)

    if echo "$LAST_LINE" | grep -q "最终汇总"; then
        log "✅ 脚本正常结束"
        break
    fi

    # 进程挂了，重启
    restart_count=$((restart_count + 1))
    log "⚠️ 进程已退出 (第 $restart_count 次重启)"

    # 读取当前进度
    LAST_SCENARIO=$(grep -oP '\[\d+/117\]' "$LOG" 2>/dev/null | tail -1)
    log "  最后场景: $LAST_SCENARIO"

    # 重启
    cd "$PROJECT_DIR"
    nohup node --expose-gc "$SCRIPT" >> "$LOG" 2>&1 &
    NEW_PID=$!
    log "  已重启 PID=$NEW_PID"

    # 挂 caffeinate
    caffeinate -w $NEW_PID &
    log "  caffeinate 已挂载"

    # 等 5 分钟再检查
    sleep 300
done

if [ $restart_count -ge $MAX_RESTARTS ]; then
    log "❌ 已达最大重启次数 ($MAX_RESTARTS)，停止守护"
fi

log "守护脚本退出"
