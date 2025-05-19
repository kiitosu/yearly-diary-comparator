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

		// デバッグ: 各ファイルのfile.name, file.basename, file.pathを出力
		for (const file of dailyNoteFiles) {
			console.log("file.name:", file.name, "file.basename:", file.basename, "file.path:", file.path);
		}

		// 年度リストの自動生成（file.basename, file.path両方で抽出を試みる）
		const yearSet = new Set<string>();
		const yearRegex = /^(\d{4})-\d{2}-\d{2}$/;
		const pathYearRegex = /(\d{4})-\d{2}-\d{2}\.md$/;
		for (const file of dailyNoteFiles) {
			const baseMatch = file.basename.match(yearRegex);
			const pathMatch = file.path.match(pathYearRegex);
			console.log("年度抽出デバッグ:", { basename: file.basename, baseMatch, path: file.path, pathMatch });
			if (baseMatch) {
				yearSet.add(baseMatch[1]);
			} else if (pathMatch) {
				yearSet.add(pathMatch[1]);
			}
		}
		const yearList = Array.from(yearSet).sort();
		console.log("年度リスト（YYYY）:", yearList);

		// 年度ごとの日記データ構造生成
		const yearDiaryMap: Record<string, Record<string, string | undefined>> = {};
		for (const year of yearList) {
			const dateMap: Record<string, string | undefined> = {};
			const startDate = new Date(Number(year), 0, 1);
			const endDate = new Date(Number(year), 11, 31);
			for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
				const mm = String(d.getMonth() + 1).padStart(2, "0");
				const dd = String(d.getDate()).padStart(2, "0");
				const dateStr = `${year}-${mm}-${dd}`;
				// ファイルが存在するか検索
				const file = dailyNoteFiles.find(f => f.basename === dateStr);
				dateMap[dateStr] = file ? file.path : undefined;
			}
			yearDiaryMap[year] = dateMap;
		}
		console.log("年度ごとの日記データ構造:", yearDiaryMap);
	}
}
