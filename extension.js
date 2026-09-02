const vscode = require('vscode');
const fs = require('fs');

class NovelParser {
    static decodeBuffer(buffer) {
        try {
            const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
            return utf8Decoder.decode(buffer);
        } catch {
            try {
                const gbkDecoder = new TextDecoder('gb18030');
                return gbkDecoder.decode(buffer);
            } catch (err) {
                return buffer.toString('utf-8');
            }
        }
    }

    static parseChapters(fullText) {
        const lines = fullText.split(/\r?\n/);
        const chapters = [];

        const chapterPatterns = [
            /^第[0-9一二三四五六七八九十百千万]+[章回节卷集幕篇部]\s*(.*)/,
            /^Chapter\s+[0-9]+/i,
            /^[0-9]+[\.、\s]+[^\s]+/,
            /^【.+】$/,
            /^={3,}.+={3,}$/
        ];

        let currentTitle = "前言/引子";
        let currentContentLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().replace(/\s+/g, ' ');
            if (!line) continue;

            const isTitle = line.length < 40 && chapterPatterns.some(reg => reg.test(line));

            if (isTitle) {
                if (currentContentLines.length > 0) {
                    chapters.push({
                        rawTitle: currentTitle,
                        content: currentContentLines.join(' ')
                    });
                    currentContentLines = [];
                }
                currentTitle = line;
            } else {
                currentContentLines.push(line);
            }
        }

        if (currentContentLines.length > 0) {
            chapters.push({
                rawTitle: currentTitle,
                content: currentContentLines.join(' ')
            });
        }

        if (chapters.length === 0 && fullText.trim().length > 0) {
            const cleanText = fullText.replace(/\s+/g, ' ');
            const sliceSize = 10000;
            for (let i = 0; i < cleanText.length; i += sliceSize) {
                const partIndex = Math.floor(i / sliceSize) + 1;
                chapters.push({
                    rawTitle: `第 ${partIndex} 部分`,
                    content: cleanText.substring(i, i + sliceSize)
                });
            }
        }

        return chapters;
    }
}

class GeekReaderApp {
    constructor(context) {
        this.context = context;
        this.isBossMode = false;

        this.showTitle = false;
        this.displayLength = 35;
        this.stepLength = 28;
        this.bossMaskText = '';

        this.chapters = [];
        this.currentChapterIndex = 0;
        this.currentOffset = 0;
        this.currentFilePath = '';

        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        // 【关键改动 1】：移除 statusBarItem.command，点击底部不产生误动作
        this.statusBarItem.command = undefined;
        this.context.subscriptions.push(this.statusBarItem);

        this.init();
    }

    async init() {
        this.reloadConfig();
        this.registerListeners();
        await this.restoreState();
        this.render();
        this.statusBarItem.show();
    }

    reloadConfig() {
        const config = vscode.workspace.getConfiguration('geekReader');
        this.showTitle = config.get('showTitle', false);
        this.displayLength = config.get('displayLength', 35);
        this.stepLength = config.get('stepLength', 28);
        this.bossMaskText = config.get('bossMaskText', '');
    }

    registerListeners() {
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('geekReader')) {
                    this.reloadConfig();
                    this.render();
                }
            })
        );
    }

    formatChapterTitle(index, rawTitle) {
        const trimmed = (rawTitle || '').trim();
        if (/^(第[0-9一二三四五六七八九十百千万]+[章回节卷集幕篇部]|[0-9]+[\.、\s]|Chapter)/i.test(trimmed)) {
            return trimmed;
        }
        const order = String(index + 1).padStart(3, '0');
        return `[${order}] ${trimmed}`;
    }

    async openFile() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: '选择文件',
            filters: { '文本文件': ['txt'] }
        });

        if (!uris || !uris[0]) return;

        const filePath = uris[0].fsPath;
        try {
            const buffer = fs.readFileSync(filePath);
            const text = NovelParser.decodeBuffer(buffer);
            const chapters = NovelParser.parseChapters(text);

            if (chapters.length === 0) {
                vscode.window.showWarningMessage('未能在该文件中解析出有效文本内容');
                return;
            }

            this.currentFilePath = filePath;
            this.chapters = chapters;
            this.currentChapterIndex = 0;
            this.currentOffset = 0;

            this.saveState();
            this.render();
            vscode.window.showInformationMessage(`成功加载，共识别出 ${chapters.length} 章节`);
        } catch (err) {
            vscode.window.showErrorMessage(`读取文件失败: ${err.message}`);
        }
    }

    // 章节快速跳转（支持搜索章节名、序号或字数偏移）
    async jumpTo() {
        if (!this.chapters.length) {
            vscode.window.showInformationMessage('请先加载文件');
            return;
        }

        // 构建快速选择列表
        const items = this.chapters.map((ch, idx) => {
            const title = this.formatChapterTitle(idx, ch.rawTitle);
            const isCurrent = idx === this.currentChapterIndex;
            return {
                label: `${isCurrent ? '$(arrow-right) ' : ''}${title}`,
                description: `共 ${ch.content.length} 字`,
                index: idx
            };
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '输入章节名或数字进行检索跳转 (例如: 10 或 媳妇)',
            matchOnDescription: true
        });

        if (selected) {
            this.currentChapterIndex = selected.index;
            this.currentOffset = 0;
            this.saveState();
            this.render();
        }
    }

    pageForward() {
        if (this.isBossMode || !this.chapters.length) return;

        const currentText = this.chapters[this.currentChapterIndex].content;

        if (this.currentOffset + this.stepLength < currentText.length) {
            this.currentOffset += this.stepLength;
        } else {
            if (this.currentChapterIndex < this.chapters.length - 1) {
                this.currentChapterIndex++;
                this.currentOffset = 0;
            } else {
                this.currentOffset = Math.max(0, currentText.length - 1);
            }
        }
        this.saveState();
        this.render();
    }

    pageBackward() {
        if (this.isBossMode || !this.chapters.length) return;

        if (this.currentOffset - this.stepLength >= 0) {
            this.currentOffset -= this.stepLength;
        } else {
            if (this.currentChapterIndex > 0) {
                this.currentChapterIndex--;
                const prevContent = this.chapters[this.currentChapterIndex].content;
                this.currentOffset = Math.max(0, prevContent.length - this.displayLength);
            } else {
                this.currentOffset = 0;
            }
        }
        this.saveState();
        this.render();
    }

    toggleBossKey() {
        this.isBossMode = !this.isBossMode;
        this.render();
    }

    saveState() {
        this.context.globalState.update('geek_last_file', this.currentFilePath);
        this.context.globalState.update('geek_last_chapter', this.currentChapterIndex);
        this.context.globalState.update('geek_last_offset', this.currentOffset);
    }

    async restoreState() {
        const lastFile = this.context.globalState.get('geek_last_file');
        const lastChapter = this.context.globalState.get('geek_last_chapter', 0);
        const lastOffset = this.context.globalState.get('geek_last_offset', 0);

        if (lastFile && fs.existsSync(lastFile)) {
            try {
                const buffer = fs.readFileSync(lastFile);
                const text = NovelParser.decodeBuffer(buffer);
                this.chapters = NovelParser.parseChapters(text);
                this.currentFilePath = lastFile;
                this.currentChapterIndex = Math.min(lastChapter, this.chapters.length - 1);
                this.currentOffset = lastOffset;
            } catch (e) {
                console.error('恢复阅读历史失败:', e);
            }
        }
    }

    render() {
        if (this.isBossMode) {
            this.statusBarItem.text = this.bossMaskText;
            this.statusBarItem.tooltip = '';
            return;
        }

        if (!this.chapters.length) {
            this.statusBarItem.text = "geek: 等待加载文件 📖";
            const emptyTooltip = new vscode.MarkdownString();
            emptyTooltip.isTrusted = true;
            emptyTooltip.appendMarkdown(`👉 **[点击可切换/重新打开本地文件](command:geek-reader.openFile)**`);
            this.statusBarItem.tooltip = emptyTooltip;
            return;
        }

        const chapter = this.chapters[this.currentChapterIndex];
        const total = chapter.content.length;
        const formattedTitle = this.formatChapterTitle(this.currentChapterIndex, chapter.rawTitle);

        const end = Math.min(this.currentOffset + this.displayLength, total);
        let textSlice = chapter.content.substring(this.currentOffset, end);

        if (textSlice.length < this.displayLength) {
            textSlice = textSlice.padEnd(this.displayLength, '\u3000');
        }

        if (this.showTitle) {
            this.statusBarItem.text = `${formattedTitle} [${this.currentOffset}/${total}] - ${textSlice}`;
        } else {
            const order = String(this.currentChapterIndex + 1).padStart(3, '0');
            this.statusBarItem.text = `[${order}] [${this.currentOffset}/${total}] ${textSlice}`;
        }

        // 【关键改动 2 & 3】：更新悬浮 Markdown 卡片
        const tooltip = new vscode.MarkdownString();
        tooltip.isTrusted = true;
        tooltip.appendMarkdown(`### 📖 ${formattedTitle}\n\n`);
        tooltip.appendMarkdown(`- **字数进度**：\`${this.currentOffset} / ${total}\` 字\n`);
        tooltip.appendMarkdown(`- **翻页快捷键**：\`Alt + Left/Right\`\n`);
        tooltip.appendMarkdown(`- **快速跳转章节**：\`Alt + J\` 或 **[点击跳转章节](command:geek-reader.jumpTo)**\n`);
        tooltip.appendMarkdown(`- **老板键**：\`Alt + Q\`\n\n`);
        tooltip.appendMarkdown(`---\n\n`);
        tooltip.appendMarkdown(`👉 **[点击可切换/重新打开本地文件](command:geek-reader.openFile)**`);

        this.statusBarItem.tooltip = tooltip;
    }
}

function activate(context) {
    const app = new GeekReaderApp(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('geek-reader.openFile', () => app.openFile()),
        vscode.commands.registerCommand('geek-reader.pageBackward', () => app.pageBackward()),
        vscode.commands.registerCommand('geek-reader.pageForward', () => app.pageForward()),
        vscode.commands.registerCommand('geek-reader.toggleBossKey', () => app.toggleBossKey()),
        vscode.commands.registerCommand('geek-reader.jumpTo', () => app.jumpTo())
    );
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};