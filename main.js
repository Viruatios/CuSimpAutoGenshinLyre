(async function () {
    const base_path = "assets/score_file/";
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
    // /**
    //  *
    //  * @returns {Array} 本地曲谱文件列表
    //  */
    // const musicList = () => {
    //     const scoreFiles = Array.from(file.readPathSync(base_path)).filter(path => !file.isFolder(path) && path.endsWith(".json"));
    //     const localMusicList = scoreFiles.map(path => path.match(regex_name)[0]);
    //     return localMusicList;
    // }

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
    function get_settings() {
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

            const allMusic = musicList();

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
     *
     * 执行单音
     *
     * @param key {string}
     *
     */
    async function play_note(key) {
        keyDown(key);
        keyUp(key);
    }

    /**
     *
     * 执行和弦
     *
     * @param keys {Array.string}
     *
     */
    async function play_chord(keys) {
        for (const key of keys) {
            play_note(key);
        }
    }

    /**
     * 音符小节序列演奏（按基本单位串行驱动）
     * @typedef {{kind:string,keys:string[],time:number}} Unit
     * @typedef {[Number,...Unit[]]} Bar
     * @param {Bar[]} bar_list
     * @param {Number} gap 一拍的时长,单位ms
     * @property {Number} barTime 小节时长
     * @property {Unit[]} units 一个小节中所有基本单位
     */
    async function listNotePlay(bar_list, gap) {
        async function sleepUntil(targetTime) {
            const remain = targetTime - Date.now();
            if (remain > 0) {
                await sleep(remain);
            }
        }

        async function unitPlay(unit, unitStartTime, gap) {
            const unitEndTime = unitStartTime + Math.round(unit.time * gap);
            // 提前15毫秒抬键，制造物理间隙，防止原神等游戏引擎吞掉无缝衔接的同名按键
            const keyUpTime = Math.max(unitStartTime + 10, unitEndTime - 15);

            if (unit.kind === "rest") {
                await sleepUntil(unitEndTime);
                return;
            }

            if (unit.kind === "single") {
                keyDown(unit.keys[0]);
                await sleepUntil(keyUpTime);
                keyUp(unit.keys[0]);
                await sleepUntil(unitEndTime);
                return;
            }

            if (unit.kind === "chord") {
                for (const key of unit.keys) {
                    keyDown(key);
                }
                await sleepUntil(keyUpTime);
                for (const key of unit.keys) {
                    keyUp(key);
                }
                await sleepUntil(unitEndTime);
                return;
            }

            if (unit.kind === "arpeggio") {
                const n = unit.keys.length;
                for (let i = 0; i < n; i++) {
                    const keyGroup = Array.isArray(unit.keys[i]) ? unit.keys[i] : [unit.keys[i]];
                    const noteStartTime = unitStartTime + Math.round((i / n) * unit.time * gap);
                    const noteEndTime = unitStartTime + Math.round(((i + 1) / n) * unit.time * gap);
                    const noteReleaseTime = Math.max(noteStartTime + 10, noteEndTime - 15);

                    await sleepUntil(noteStartTime);
                    for (const key of keyGroup) {
                        keyDown(key);
                    }
                    await sleepUntil(noteReleaseTime);
                    for (const key of keyGroup) {
                        keyUp(key);
                    }
                }
                await sleepUntil(unitEndTime);
                return;
            }

            await sleepUntil(unitEndTime);
        }
        log.info(`总计 ${bar_list.length} 小节, 预计演奏时长 ${(bar_list.length * gap * bar_list[0][0] / 1000).toFixed(2)}秒`);
        for (let i = 0; i < bar_list.length; i++) {
            let bar = bar_list[i];
            let barTime = bar[0];
            let units = bar.slice(1);
            const barStartTime = Date.now();
            let elapsedBeat = 0;
            for (let j = 0; j < units.length; j++) {
                let unit = units[j];
                const unitStartTime = barStartTime + Math.round(elapsedBeat * gap);
                await sleepUntil(unitStartTime);
                await unitPlay(unit, unitStartTime, gap);
                elapsedBeat += unit.time;
            }
            if (DEBUG) {
                log.info(`${i} / ${bar_list.length} ${(i / bar_list.length * 100).toFixed(2)}%`)
            }
            await sleepUntil(barStartTime + Math.round(barTime * gap)); // 对齐至小节结束
        }
        await sleep(Math.round(gap * 8)); // 额外等待
    }

    /**
     * 将乐谱键位字符串序列化为按小节分组的基本单位数组
     * 
     * @param {string} stringSheet - 待序列化的键位乐谱字符串
     * @returns {Array<Array<number|Object>>} - 小节数组，每个小节为数组结构(首元素为总拍数，后接基本单位对象)：
     *   - { kind: "rest"|"single"|"chord"|"arpeggio", keys: string[], time: number }
     */
    function keySheetSerialization(stringSheet) {
        const result = [];
        const toValidKeys = (text) => {
            const letters = text.match(/[a-z]/gi);
            return letters ? letters.map(ch => ch.toUpperCase()) : [];
        };

        // 处理换行符
        stringSheet = stringSheet.replace(/\r/g, "");
        // 处理相邻的 / 和 \n，不生成休止符
        stringSheet = stringSheet.replace(/\/\n/g, "\n").replace(/\n\//g, "\n");
        // 空行特例：连续换行不产生休止符
        stringSheet = stringSheet.replace(/\n{2,}/g, "\n");

        // 单行之中的按键视作一小节
        const lines = stringSheet.split('\n');

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx];
            if (line.trim().length === 0) continue; // 忽略空行，不产生休止符

            // 两个“/”符号之间的按键是一拍
            const beats = line.split('/');
            const barLength = beats.length;
            const bar = [barLength]; // 第一项为小节里的总拍数

            for (let beatIdx = 0; beatIdx < beats.length; beatIdx++) {
                const beatStr = beats[beatIdx];

                // 谱序列通过“空格”和“/”进行划分。
                // 排除位于“/”号前的空字串，将剩余的空字串视作“休止符”（休止符）
                let processedBeatStr = beatStr.replace(/ +$/, '');
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
                        // 琶音按键，可能包含混合的单音或和弦
                        const arpeggioKeys = parts.map(part => toValidKeys(part));
                        bar.push({ kind: "arpeggio", keys: arpeggioKeys, time: unitDuration });
                    }
                }
            }
            if (bar.length > 1 || barLength > 0) result.push(bar);
        }

        return result;
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
    function checkSheetFile() {
        try {
            // 1. 读取本地所有JSON曲谱文件
            const localMusicList = musicList();

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
        if (!checkSheetFile()) return;

        let settings_msg = get_settings();
        DEBUG = settings_msg.debug;

        const music_infos = [];
        for (const music_name of settings_msg.musicQueue) {
            const music_info = getMusicInfo(music_name);
            if (music_info === null) {
                log.error(`乐曲 ${music_name} 信息有误，已跳过`);
                continue;
            }
            music_infos.push(music_info);
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
                const music_info = music_infos[i];
                log.info(`开始演奏: ${music_info.name} - ${music_info.author}`);
                if (DEBUG) {
                    log.info(`乐曲已打印至${music_info.name}.json`);
                    let info = [];
                    music_info.notes.forEach((note, index) => {
                        info.push([index, ...note]);
                    });
                    file.writeTextSync(`${music_info.name}.json`, `${JSON.stringify(info)}`);
                }
                // 计算每拍时长，默认以四分音符为基准。当遇到非四分音符基底的拍号时，自动进行修正以防止速度异常。
                let gapMultiplier = 1;
                if (music_info.time_signature && music_info.time_signature.includes('/')) {
                    const [numStr, denStr] = music_info.time_signature.split('/');
                    const num = parseInt(numStr) || 4;
                    const den = parseInt(denStr) || 4;

                    if (den === 8 && num % 3 === 0) {
                        // 对于 6/8, 9/8 等复合拍子，通常以附点四分音符为一拍（即1.5个四分音符）
                        gapMultiplier = 1.5;
                    } else {
                        // 其他情况按占四分音符的比例
                        gapMultiplier = 4 / den;
                    }
                }
                await listNotePlay(music_info.notes, (60000 / music_info.bpm) * gapMultiplier);

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
