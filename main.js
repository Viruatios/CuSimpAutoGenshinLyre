/// <reference path="bettergi.d.ts" />

(async function () {
    const base_path = "assets/score_file/";
    const cache_path = "assets/cache/";
    const regex_name = /(?<=score_file\\)[\s\S]*?(?=.json)/;
    const PlayType = {
        SingleMusicOnce: 0, // 单曲单次执行
        SingleMusicRepeat: 1, // 单曲循环执行
        QueueMusicOnce: 2, // 队列单次执行
        QueueMusicRepeat: 3, // 队列循环执行
    };
    let DEBUG = false;
    /**
     * -------- 工具函数 --------
     */

    function ensureCacheDir() {
        try {
            if (!file.isFolder(cache_path)) {
                if (typeof System !== 'undefined' && System.IO && System.IO.Directory) {
                    System.IO.Directory.CreateDirectory(cache_path);
                }
            }
        } catch (e) {
            log.error(`创建缓存目录失败: ${e}`);
        }
    }

    /**
     * 获取文件修改时间 (返回时间戳)
     */
    function getFileModTime(path) {
        try {
            if (typeof System !== 'undefined' && System.IO && System.IO.File) {
                const dt = System.IO.File.GetLastWriteTimeUtc(path);
                return new Date(dt.Year, dt.Month - 1, dt.Day, dt.Hour, dt.Minute, dt.Second, dt.Millisecond).getTime();
            }
        } catch (e) { }
        return 0; // 无法获取时默认返回0
    }

    /**
     * 删除文件
     */
    function deleteFile(path) {
        try {
            if (typeof System !== 'undefined' && System.IO && System.IO.File) {
                System.IO.File.Delete(path);
            }
        } catch (e) { }
    }

    /**
     * 启动时检查清理过期缓存
     */
    function checkAndCleanCache(allMusicList) {
        ensureCacheDir();
        try {
            if (!file.isFolder(cache_path)) return;
            const cacheEntries = Array.from(file.readPathSync(cache_path));
            const jsonCaches = cacheEntries.filter(entry => !file.isFolder(entry) && entry.endsWith('.json'));

            const musicSet = new Set(allMusicList);

            jsonCaches.forEach(entry => {
                const fileName = entry.split(/[/\\]/).pop();
                const musicName = fileName.replace(/\.json$/, '');
                const scoreFile = pathJoin(musicName);

                try {
                    // 若原曲目不存在则删除
                    if (!musicSet.has(musicName)) {
                        deleteFile(entry);
                        log.debug(`缓存对应的曲谱不存在，已删除过期缓存: ${fileName}`);
                        return;
                    }

                    const modTime = getFileModTime(scoreFile);
                    const cacheModTime = getFileModTime(entry);

                    // 缓存修改时间早于曲谱修改时间，则删除
                    if (modTime > 0 && cacheModTime < modTime) {
                        deleteFile(entry);
                        log.debug(`曲谱已修改，已删除过期缓存: ${fileName}`);
                    }
                } catch (err) {
                    deleteFile(entry);
                }
            });
        } catch (error) {
            log.error(`检查缓存时出错: ${error}`);
        }
    }

    /**
     * 读取本地曲谱文件夹下的所有 .json 文件，并返回文件名列表。
     * 同时自动修正不合规的文件名：格式为 000X.任意字符.json（X 为四位数字，不足补零）。
     * 重命名规则：对于不合规文件，分配当前未使用的最小四位数字作为前缀，保留原文件名主体。
     * @returns {Array} 本地曲谱文件列表（合规文件名）
     */
    const musicList = () => {
        const usedNumbers = new Set();
        const finalList = [];

        // readPathSync(base_path) 返回完整相对路径
        const entries = Array.from(file.readPathSync(base_path));
        const jsonEntries = entries.filter(entry => !file.isFolder(entry) && entry.endsWith('.json'));

        // 统计已有编号
        jsonEntries.forEach(entry => {
            const fileName = entry.split(/[/\\]/).pop();
            if (/^\d{4}\..*\.json$/.test(fileName)) {
                usedNumbers.add(parseInt(fileName.substring(0, 4), 10));
            }
        });

        // 处理每个文件
        jsonEntries.forEach(entry => {
            const fileName = entry.split(/[/\\]/).pop();
            const dirPath = entry.slice(0, entry.length - fileName.length);

            if (/^\d{4}\..*\.json$/.test(fileName)) {
                // 合规：返回不带 .json 的文件名
                finalList.push(fileName.replace(/\.json$/, ''));
            } else {
                // 不合规：自动补零
                const baseName = fileName.replace(/\.json$/, '');

                let newNum = 1;
                while (usedNumbers.has(newNum)) newNum++;

                const newPrefix = newNum.toString().padStart(4, '0');
                const newFileName = `${newPrefix}.${baseName}.json`;

                const oldPath = entry;
                const newPath = dirPath + newFileName;
                log.debug(`${oldPath} -> ${newPath}`);

                file.renamePathSync(oldPath, newPath);

                finalList.push(`${newPrefix}.${baseName}`);
                usedNumbers.add(newNum);
            }
        });

        // 排序
        finalList.sort((a, b) => {
            const na = parseInt(a.substring(0, 4), 10);
            const nb = parseInt(b.substring(0, 4), 10);
            return na - nb;
        });

        return finalList; // 返回不带 .json 的文件名
    };


    /**
     *
     * 根据乐曲文件名生成乐曲文件路径
     *
     * @param music_name 乐曲文件名
     * @returns {string} 乐曲文件路径
     */
    function pathJoin(music_name) {
        return base_path + music_name + ".json";
    }

    /**
     * 获取JS脚本配置
     *
     * @returns {Object} 包含解析后JS脚本配置的对象，具有以下属性：
     * @property {Number} startTime - 目标时间的时间戳
     * @property {Number} playType - 播放模式，使用PlayType枚举
     * @property {Array[String]} musicQueue - 乐曲队列，包含乐曲文件名的数组
     * @property {Number} queueInterval - 乐曲队列间隔时间，单位为秒
     * @property {Number} repeatTimes - 循环执行次数
     * @property {Number} repeatInterval - 循环间隔时间，单位为秒
     * @property {Boolean} debug - 是否启用调试模式
     *
     */
    function get_settings(allMusic) {
        const Settings = {
            startTime: 0,
            playType: PlayType.SingleMusicOnce,
            musicQueue: [],
            queueInterval: 0,
            repeatTimes: 0,
            repeatInterval: 0,
            debug: false
        }


        /**
         * @param {String} timeString 
         * @returns {Number} 目标时间运行当天的时间戳
         * @example
         * console.log(calTargetTimeStamp('14:30:00')) // at 2025/9/10
         * -> 1757485800000 (2025/9/10 14:30:00)的时间戳
         */
        const calTargetTimeStamp = (timeString) => {
            if (typeof timeString !== "string") return 0;

            const normalized = timeString.replace(/[^0-9:]/g, "").trim();
            if (normalized === "") return 0;

            const parts = normalized.split(':').map(Number);
            if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) {
                throw new Error(`定时启动时间格式错误: ${timeString}`);
            }

            const [hours, minutes, seconds = 0] = parts;
            if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
                throw new Error(`定时启动时间超出范围: ${timeString}`);
            }

            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const day = now.getDate();

            const localDate = new Date(year, month, day, hours, minutes, seconds);
            return localDate.getTime();
        }

        const parseNonNegativeInt = (value, defaultValue) => {
            if (typeof value === "undefined" || value === null || `${value}`.trim() === "") {
                return defaultValue;
            }

            const parsed = parseInt(value, 10);
            return Number.isNaN(parsed) || parsed < 0 ? defaultValue : parsed;
        };
        try {
            // 读取开始时间
            let music_start = typeof (settings.music_start) === 'undefined' ? "" : settings.music_start;
            Settings.startTime = calTargetTimeStamp(music_start);
            // 读取播放模式
            let type_select = typeof (settings.type_select) === 'undefined' ? "单曲单次执行" : settings.type_select;
            switch (type_select) {
                case "单曲单次执行":
                    Settings.playType = PlayType.SingleMusicOnce;
                    break;
                case "单曲循环":
                    Settings.playType = PlayType.SingleMusicRepeat;
                    break;
                case "队列单次执行":
                    Settings.playType = PlayType.QueueMusicOnce;
                    break;
                case "队列循环":
                    Settings.playType = PlayType.QueueMusicRepeat;
                    break;
                default:
                    Settings.playType = PlayType.SingleMusicOnce;
                    break;
            }

            // 读取队列间隔时间
            Settings.queueInterval = parseNonNegativeInt(settings.music_interval, 0);
            // 读取循环次数
            Settings.repeatTimes = parseNonNegativeInt(settings.music_repeat, 0);
            // 读取循环间隔时间
            Settings.repeatInterval = parseNonNegativeInt(settings.repeat_interval, 0);
            // 读取乐曲队列 Array[musicName]
            if (Settings.playType === PlayType.SingleMusicOnce || Settings.playType === PlayType.SingleMusicRepeat) {
                const selectedMusic = (typeof (settings.music_selector) === 'undefined') ? undefined : settings.music_selector;
                if (typeof selectedMusic === "string" && allMusic.includes(selectedMusic)) {
                    Settings.musicQueue.push(selectedMusic);
                } else if (allMusic.length > 0) {
                    Settings.musicQueue.push(allMusic[0]);
                }
            }
            else {
                const music_queue = (typeof (settings.music_queue) === 'undefined') ? "" : `${settings.music_queue}`;
                const queueText = music_queue.trim();

                // 队列留空时，默认按本地曲谱顺序全部播放
                if (queueText === "") {
                    Settings.musicQueue = [...allMusic];
                } else {
                    const musicIndex = Array.from(new Set(queueText.split(/\s+/).filter(item => item !== ""))); // 去重
                    musicIndex.forEach(indexStr => {
                        const normalizedIndex = parseInt(indexStr, 10);
                        if (Number.isNaN(normalizedIndex) || normalizedIndex <= 0) return;
                        const prefix = normalizedIndex.toString().padStart(4, '0');
                        const matchedMusic = allMusic.find(music => music.startsWith(`${prefix}.`));
                        if (matchedMusic) {
                            Settings.musicQueue.push(matchedMusic);
                        }
                    });
                }

                if (Settings.musicQueue.length === 0 && allMusic.length > 0) {
                    Settings.musicQueue = [...allMusic];
                    log.warn("未匹配到有效队列序号，已自动切换为全部曲目播放");
                }
            }

            if (Settings.musicQueue.length === 0) {
                throw new Error("本地曲谱为空，无法开始演奏");
            }

            Settings.debug = (typeof (settings.debug) === 'undefined') ? (false) : (settings.debug === "启用");
            return Settings;

        } catch (error) {
            log.error(`读取JS脚本配置时出错：${error}`);
            return Settings;
        }
    }

    /**
     *
     * 读取并解析一个乐谱文件
     *
     * @param music_name {string} 乐曲文件名
     * @returns {Promise<{}|null>}
     * @property {string} name 乐曲名称
     * @property {string} author 作者
     * @property {string} instrument 建议乐器
     * @property {string} description 乐曲描述
     * @property {string} type 乐曲类型
     * @property {number} bpm BPM
     * @property {string} time_signature 拍号
     * @property {string} composer 作曲者
     * @property {string} arranger 编曲者
     * @property {Object[][]} notes 乐谱内容
     */
    function getMusicInfo(music_name) {
        const MusicInfo = {
            name: undefined, // 乐曲名称
            author: undefined, // 作者
            instrument: undefined, // 乐器
            description: undefined, // 乐曲描述
            type: undefined, // 乐曲类型
            bpm: undefined, // BPM
            time_signature: undefined, // 拍号
            composer: undefined, // 作曲者
            arranger: undefined, // 编曲者
            notes: undefined, // 乐谱内容
        }

        let music_path = pathJoin(music_name);
        let file_text = ""; // 存储乐曲文件内容
        // 读取并检查文件
        try {
            file_text = file.readTextSync(music_path);
        } catch (error) {
            log.error(`文件无法读取：${music_path}\nerror:${error}`);
        }

        if (file_text == null) { // 检测文件是否读取
            log.error(`读取文件 ${music_path} 错误，文件为空`);
            return null;
        }
        // else {
        //     log.info(`文件读取成功: ${music_path}`);
        // }

        let music_msg_dic = JSON.parse(file_text);
        let regex_blank = /[\n]/g;

        MusicInfo.name = (music_msg_dic.name !== undefined) ? (music_msg_dic.name) : ("未知曲名");
        MusicInfo.author = (music_msg_dic.author !== undefined) ? (music_msg_dic.author) : ("未知作者");
        MusicInfo.instrument = (music_msg_dic.instrument !== undefined) ? (music_msg_dic.instrument) : ("无建议乐器");
        MusicInfo.description = (music_msg_dic.description !== undefined) ? (music_msg_dic.description) : ("无描述");
        MusicInfo.composer = (music_msg_dic.composer !== undefined) ? (music_msg_dic.composer) : ("未知作曲者");
        MusicInfo.arranger = (music_msg_dic.arranger !== undefined) ? (music_msg_dic.arranger) : ("未知编曲者");
        // 必要信息
        MusicInfo.type = "keyboard";
        MusicInfo.bpm = (music_msg_dic.bpm !== undefined) ? (music_msg_dic.bpm) : (120);
        MusicInfo.time_signature = (music_msg_dic.time_signature !== undefined) ? (music_msg_dic.time_signature) : ("4/4");

        if (music_msg_dic.notes === undefined) {
            log.error(`文件 ${music_name} 无乐曲信息`);
            return null;
        }

        MusicInfo.notes = keySheetSerialization(music_msg_dic.notes);

        return MusicInfo;
    }

    /**
     * 将乐谱键位字符串序列化为按小节分组的基本单位数组
     * 
     * @param {string} stringSheet - 待序列化的键位乐谱字符串
     * @returns {Array<Array<number|Object>>} - 小节数组
     */
    function keySheetSerialization(stringSheet) {
        const result = [];
        const toValidKeys = (text) => {
            return text.toUpperCase().match(/[A-Z]/g) || [];
        };

        // 单行之中的按键视作一小节
        const lines = stringSheet.split('\n');

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx].replace(/\r/g, "");
            if (line.trim().length === 0) continue; // 忽略空行

            // 处理相邻的 /，不生成休止符
            line = line.replace(/\/{2,}/g, "/");

            const beats = line.split('/');
            const barLength = beats.length;
            const bar = [barLength]; // 第一项为小节里的总拍数

            for (let beatIdx = 0; beatIdx < beats.length; beatIdx++) {
                const beatStr = beats[beatIdx];

                let processedBeatStr = beatStr.trimEnd();
                if (processedBeatStr === "" && beatIdx === beats.length - 1) continue;

                let units = processedBeatStr.split(' ');
                units = units.map(u => u === "" ? "@" : u);

                const unitDuration = 1 / units.length;

                for (let unitIdx = 0; unitIdx < units.length; unitIdx++) {
                    const unitStr = units[unitIdx];

                    if (unitStr === "@") {
                        bar.push({ kind: "rest", keys: [], time: unitDuration });
                        continue; // 休止符
                    }

                    // 使用正则提取基本单位内的原子（单词块(XXX)或单个字母X）
                    const parts = unitStr.match(/\([A-Za-z]+\)|[A-Za-z]/g);
                    if (!parts || parts.length === 0) {
                        bar.push({ kind: "rest", keys: [], time: unitDuration });
                        continue;
                    }

                    if (parts.length === 1) {
                        const part = parts[0];
                        const keys = toValidKeys(part);
                        if (part.startsWith('(')) {
                            // 同时按下 (XYZ)
                            bar.push({ kind: "chord", keys: keys, time: unitDuration });
                        } else {
                            // 单个按键
                            bar.push({ kind: "single", keys: keys, time: unitDuration });
                        }
                    } else {
                        // 连续按键，可能包含混合的单音或和弦
                        const arpeggioKeys = parts.map(part => toValidKeys(part));
                        bar.push({ kind: "arpeggio", keys: arpeggioKeys, time: unitDuration });
                    }
                }
            }
            if (bar.length > 1 || barLength > 0) result.push(bar);
        }

        return result;
    }

    // 生成缓存文件：构建按键时间轴，然后合并简化

    /**
     * @param {Bar[]} bar_list 乐谱小节数组
     * @param {Number} gap 一拍的时长，单位ms
     * @returns {Object} 包含 mergedTimeline 和 totalCalculatedTime
     */

    // 1. 预处理（Pre-bake）阶段：将乐谱信息转换为按键事件时间轴，包含每个按键的下压和抬起时间点
    function prebakeTimeline(bar_list, gap) {
        const keyState = {};
        // 最小间隔时间 25ms
        const MIN_GAP_TIME = 25;
        const timeline = [];

        // 计算脉冲式短触按键动作，将其注册到时间轴上，并更新物理状态机以供后续动作参考
        function addKeyPulse(key, targetHalfTime, simTime) {
            const lastUp = keyState[key] || 0;
            let actualDownTime = simTime;

            // 判断是否需要延时阻塞，如果上次抬起时间距离当前模拟时间不足最小间隔，则推迟按下时间以保证间隔
            const timeSinceLastUp = actualDownTime - lastUp;
            if (timeSinceLastUp < MIN_GAP_TIME) {
                actualDownTime = lastUp + MIN_GAP_TIME;
            }

            // 动态计算脉冲时长，确保最少有1ms以防为0或负数
            let holdTime = Math.min(MIN_GAP_TIME, targetHalfTime);
            holdTime = Math.max(1, Math.round(holdTime));

            const actualUpTime = actualDownTime + holdTime;

            // 在事件调度表上注册成对的下压和抬起动作
            timeline.push({ time: actualDownTime, action: "down", key: key });
            timeline.push({ time: actualUpTime, action: "up", key: key });

            // 更新物理状态机
            keyState[key] = actualUpTime;
        }

        // 对所有音符执行虚拟模拟打点，结果注册到时间轴
        let currentSimTime = 0;
        let totalCalculatedTime = 0;

        for (let i = 0; i < bar_list.length; i++) {
            // 以下变量分别代表：当前小节的总拍数、基本单位列表，以及当前小节内已处理的拍数（用于计算每个基本单位的起始时间）
            let bar = bar_list[i];
            let barTime = bar[0];
            let units = bar.slice(1);
            let elapsedBeat = 0;

            for (let j = 0; j < units.length; j++) {
                let unit = units[j];
                const unitStartTime = currentSimTime + Math.round(elapsedBeat * gap);

                if (unit.kind === "single") {
                    // 单音符
                    const targetHalfTime = unit.time * gap * 0.5;
                    addKeyPulse(unit.keys[0], targetHalfTime, unitStartTime);
                }
                else if (unit.kind === "chord") {
                    // 和弦
                    const targetHalfTime = unit.time * gap * 0.5;
                    unit.keys.forEach(key => addKeyPulse(key, targetHalfTime, unitStartTime));
                }
                else if (unit.kind === "arpeggio") {
                    // 琶音
                    const n = unit.keys.length;

                    // 琶音特殊的规则：视为单音符和和弦的组合，每个基本单位都被平均分配到该基本单位的时间片上，并且按照顺序依次触发
                    for (let k = 0; k < n; k++) {
                        const keyGroup = Array.isArray(unit.keys[k]) ? unit.keys[k] : [unit.keys[k]];
                        const noteStartTime = unitStartTime + Math.round((k / n) * unit.time * gap);
                        const stepHalfTime = (unit.time * gap / n) * 0.5;
                        keyGroup.forEach(key => addKeyPulse(key, stepHalfTime, noteStartTime));
                    }
                }
                elapsedBeat += unit.time;
            }
            // 对齐至小节结束时间
            currentSimTime += Math.round(barTime * gap);
            totalCalculatedTime = currentSimTime;
        }

        // 2. 扁平化合并同时刻、同动作的事件
        timeline.sort((a, b) => {
            // 时间先后排序
            if (a.time !== b.time) return a.time - b.time;
            // 同一时间先处理抬起(up)，再处理按下(down)，避免同键冲突
            if (a.action !== b.action) return a.action === "up" ? -1 : 1;
            return 0;
        });

        const mergedTimeline = [];
        for (const ev of timeline) {
            if (mergedTimeline.length > 0) {
                let last = mergedTimeline[mergedTimeline.length - 1];
                if (last.time === ev.time && last.action === ev.action) {
                    last.keys.push(ev.key); // 同步合并
                    continue;
                }
            }
            mergedTimeline.push({ time: ev.time, action: ev.action, keys: [ev.key] });
        }

        return { mergedTimeline, totalCalculatedTime };
    }

    /**
     * 运行时扫描播放器
     */
    async function playCachedTimeline(music_info, mergedTimeline, totalCalculatedTime, gap) {
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

    async function waitTargetTime(targetTimeStamp) {
        if (!Number.isFinite(targetTimeStamp) || targetTimeStamp <= 0) return;
        let now = new Date();
        if (now.getTime() >= targetTimeStamp) return;
        log.info(`等待至目标时间: ${new Date(targetTimeStamp).toLocaleString()}`);
        if ((targetTimeStamp - now.getTime()) > 100) {
            await sleep(targetTimeStamp - now.getTime() - 100);
        }
        while (Date.now() < targetTimeStamp) {
            await sleep(5);
        }
        return;
    }

    /**
     * 检查本地曲谱文件与主程序配置是否一致，并自动修正配置settings文件。
     *
     * @returns {boolean} 如果一致返回 true，否则返回 false。
     */
    function checkSheetFile(localMusicList) {
        try {
            // 1. 读取本地所有JSON曲谱文件 (此处直接复用了传入的列表，减少磁盘I/O)

            // 2. 读取JS脚本配置中的曲谱列表
            const settings = JSON.parse(file.readTextSync("settings.json"));
            let configMusicList = undefined;
            let indexOfMusicSelector = -1;
            for (let i = 0; i < settings.length; i++) {
                if (settings[i].name === "music_selector") {
                    indexOfMusicSelector = i;
                    configMusicList = settings[i].options;
                    break;
                }
            }
            // 3. 核对两个列表是否相同
            const areArraysEqual = (a, b) => {
                if (a.length !== b.length) return false;
                const sortedA = [...a].sort();
                const sortedB = [...b].sort();
                return sortedA.every((item, index) => item === sortedB[index]);
            };

            if (!areArraysEqual(localMusicList, configMusicList)) {
                // 以本地曲谱为准更新配置
                const updatedSettings = [...settings];
                updatedSettings[indexOfMusicSelector].options = localMusicList;
                file.writeTextSync("settings.json", JSON.stringify(updatedSettings, null, 2));
                log.warn("检测到曲谱文件不一致, 已自动修改settings(以本地曲谱文件为基准)...");
                log.warn("JS脚本配置已更新, 请重新运行脚本!");
                return false;
            }

            return true;
        } catch (error) {
            log.error("检查曲谱文件时发生错误:", error);
            return false;
        }
    }

    /**
     * ------- 主程序 --------
     */
    async function main() {
        const allMusicList = musicList();
        checkAndCleanCache(allMusicList);
        if (!checkSheetFile(allMusicList)) return;

        let settings_msg = get_settings(allMusicList);
        DEBUG = settings_msg.debug;

        const music_infos = [];
        for (const music_name of settings_msg.musicQueue) {
            music_infos.push({ music_name });
        }

        if (music_infos.length === 0) {
            log.error("无可演奏曲目，脚本结束");
            return;
        }

        const isQueueMode = settings_msg.playType === PlayType.QueueMusicOnce || settings_msg.playType === PlayType.QueueMusicRepeat;
        const isRepeatMode = settings_msg.playType === PlayType.SingleMusicRepeat || settings_msg.playType === PlayType.QueueMusicRepeat;
        const alwaysRepeat = isRepeatMode && settings_msg.repeatTimes === 0;
        let remainRounds = isRepeatMode ? Math.max(1, settings_msg.repeatTimes) : 1;

        await waitTargetTime(settings_msg.startTime);
        // try {
        do {
            for (let i = 0; i < music_infos.length; i++) {
                const base_info = music_infos[i];
                const music_name = base_info.music_name;
                let music_info = null;

                // 优先尝试读取缓存
                const cacheFile = `${cache_path}${music_name}.json`;
                try {
                    const cacheText = file.readTextSync(cacheFile);
                    if (cacheText) {
                        // Lazy Load：仅在演奏这首时加载它的缓存，避免一次性加载过多曲目导致内存占用过高
                        music_info = JSON.parse(cacheText);
                        log.debug(`命中缓存: ${music_name}`);
                    }
                } catch (e) { }

                // 无缓存，解析曲谱并重新生成缓存
                if (!music_info) {
                    music_info = getMusicInfo(music_name);
                    if (music_info === null) {
                        log.error(`乐曲 ${music_name} 信息有误，已跳过`);
                        continue;
                    }

                    // 预处理：首先根据BPM和拍号计算每拍时长，然后生成按键事件时间轴
                    let gapMultiplier = 1;
                    if (music_info.time_signature && music_info.time_signature.includes('/')) {
                        const [numStr, denStr] = music_info.time_signature.split('/');
                        const den = parseInt(denStr) || 4;
                        const num = parseInt(numStr) || 4;

                        if (den === 8 && num % 3 === 0) gapMultiplier = 1.5;
                        else gapMultiplier = 4 / den;
                    }
                    const gap = (60000 / music_info.bpm) * gapMultiplier;
                    const { mergedTimeline, totalCalculatedTime } = prebakeTimeline(music_info.notes, gap);

                    // 构造缓存对象
                    const cacheData = {
                        name: music_info.name,
                        author: music_info.author,
                        barCount: music_info.notes.length,
                        eventBatchCount: mergedTimeline.length,
                        expectedDuration: totalCalculatedTime,
                        create_time: new Date().getTime(),
                        gap: gap,
                        mergedTimeline: mergedTimeline
                    };

                    try {
                        file.writeTextSync(cacheFile, JSON.stringify(cacheData));
                        log.info(`已生成缓存: ${music_name}`);
                    } catch (e) {
                        log.warn(`生成缓存失败: ${music_name}`);
                    }

                    music_info = cacheData;
                }

                log.info(`准备演奏: ${music_info.name} - ${music_info.author}`);

                await playCachedTimeline(music_info, music_info.mergedTimeline, music_info.expectedDuration, music_info.gap);

                // Lazy Load：播放完成后立刻显式内存回收
                music_info.mergedTimeline = null;
                music_info = null;

                if (isQueueMode && settings_msg.queueInterval > 0 && i < music_infos.length - 1) {
                    await sleep(settings_msg.queueInterval * 1000);
                }
            }

            if (!alwaysRepeat) {
                remainRounds--;
            }

            if (isRepeatMode && settings_msg.repeatInterval > 0 && (alwaysRepeat || remainRounds > 0)) {
                await sleep(settings_msg.repeatInterval * 1000);
            }
        } while (alwaysRepeat || remainRounds > 0);
        // } catch (error) {
        //     if (DEBUG) {
        //         log.error(`脚本执行错误 ${error} erron.txt 已打印`)
        //         file.writeTextSync("erron.txt", `${error.stack}`);
        //     }
        //     else {
        //         log.error(`脚本执行错误 ${error}`)
        //     }
        // }
    }
    await main();

})();
