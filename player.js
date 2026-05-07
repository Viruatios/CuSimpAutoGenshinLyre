export async function playCachedTimeline(music_info, mergedTimeline, totalCalculatedTime, gap) {
    log.info(`[${music_info.name}] 预计总演奏时长 ${((totalCalculatedTime + gap * 8) / 1000).toFixed(2)} 秒. 批次指令: ${mergedTimeline.length}`);

    // 后台消息接口，负责将预处理好的按键事件发送给游戏，使得游戏演奏时不必总是保持在前台
    const postMessage = new PostMessage();
    const getNow = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

    // 3. 启动 运行时 时间轴扫描 播放器
    const playStartTime = getNow();

    for (const ev of mergedTimeline) {
        const targetTime = playStartTime + ev.time;
        const remain = targetTime - getNow();

        if (remain > 5) {
            // 在剩余时间充裕时使用 sleep 进行阻塞等待，减少CPU占用
            await sleep(remain - 5);
        }
        while (getNow() < targetTime) {
            // 冲刺阶段，使用高精度自旋对齐，取消阻塞
        }

        // 执行聚合后的按键组指令
        if (ev.action === "down") {
            ev.keys.forEach(k => postMessage.keyDown(k));
        } else {
            ev.keys.forEach(k => postMessage.keyUp(k));
        }
    }

    // 结尾保护等待，确保最后一个按键动作有足够时间被执行，避免过早结束脚本导致按键未能正确抬起
    const finalRemain = (playStartTime + totalCalculatedTime + Math.round(gap * 8)) - getNow();
    if (finalRemain > 0) {
        await sleep(finalRemain);
    }
}
