import { Plugin } from 'obsidian';

/**
 * 年度ごとに日記を比較表示するObsidianプラグインの初期セットアップ
 */
export default class YearlyDiaryComparatorPlugin extends Plugin {
	async onload() {
		// daily noteディレクトリのパスとファイル一覧を取得してコンソールに出力
		this.logDailyNoteFiles();
	}

	onunload() {
		// クリーンアップ処理（必要に応じて実装）
	}

	/**
	 * daily noteディレクトリのパスとファイル一覧を取得し、コンソールに出力
	 */
	async logDailyNoteFiles() {
		// Obsidianの「日記」コアプラグインの設定からdaily noteフォルダのパスを取得
		let dailyNoteFolder: string | undefined = undefined;
		const dailyNotesPlugin = (this.app as any).plugins?.getPlugin?.("daily-notes");

		if (dailyNotesPlugin && typeof dailyNotesPlugin?.options?.folder === "string") {
			dailyNoteFolder = dailyNotesPlugin.options.folder;
		} else {
			// plugins.getPluginで取得できない場合はinternalPlugins経由で取得を試みる
			const internalDailyNotes = (this.app as any).internalPlugins?.plugins?.["daily-notes"];
			if (internalDailyNotes && internalDailyNotes?.instance?.options?.folder !== undefined) {
				dailyNoteFolder = internalDailyNotes.instance.options.folder;
				console.log("internalPluginsから取得:", dailyNoteFolder);
			}
		}
		const files = this.app.vault.getFiles();
		let dailyNoteFiles;
		if (!dailyNoteFolder) {
			// フォルダ設定が空の場合はVaultルート直下を対象
			dailyNoteFiles = files.filter(file => !file.path.includes("/"));
		} else {
			// フォルダが指定されている場合はその配下を対象
			dailyNoteFiles = files.filter(file => file.path.startsWith(dailyNoteFolder + "/"));
		}
		console.log("Daily Note Folder:", dailyNoteFolder ?? "(Vault root)");
		console.log("Daily Note Files:", dailyNoteFiles.map(f => f.path));
	}
}
