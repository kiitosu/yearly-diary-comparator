import { Plugin, WorkspaceLeaf, ItemView, TFile, MarkdownRenderer } from 'obsidian';

/**
 * 年度ごとに日記を比較表示するObsidianプラグイン
 */
const VIEW_TYPE_YEARLY_DIARY_COMPARE = "yearly-diary-compare-view";

export default class YearlyDiaryComparatorPlugin extends Plugin {
	async onload() {
		// 左リボンに年度比較リスト表示ボタンを追加
		this.addRibbonIcon('columns-3', '年度別比較リスト表示', () => {
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_YEARLY_DIARY_COMPARE);
			if (leaves.length > 0) {
				leaves[0].detach();
			} else {
				this.activateView();
			}
		});

		// コマンド追加: 年度比較ビューを開く
		this.addCommand({
			id: "open-yearly-diary-compare-view",
			name: "年度比較ビューを開く",
			callback: () => {
				this.activateView();
			},
		});

		// Viewの登録
		this.registerView(
			VIEW_TYPE_YEARLY_DIARY_COMPARE,
			(leaf) => new YearlyDiaryCompareView(leaf, this)
		);
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		// 既存の同種Viewがあればそれを使う
		const existingLeaf = workspace.getLeavesOfType(VIEW_TYPE_YEARLY_DIARY_COMPARE)[0];
		if (existingLeaf) {
			leaf = existingLeaf;
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_YEARLY_DIARY_COMPARE,
					active: true,
				});
			}
		}
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		// クリーンアップ処理（必要に応じて実装）
	}

	/**
	 * 年度ごとの日記データ構造を取得
	 */
	async getYearDiaryMap(): Promise<Record<string, Record<string, string | undefined>>> {
		let dailyNoteFolder: string | undefined = undefined;
		const dailyNotesPlugin = (this.app as any).plugins?.getPlugin?.("daily-notes");

		if (dailyNotesPlugin && typeof dailyNotesPlugin?.options?.folder === "string") {
			dailyNoteFolder = dailyNotesPlugin.options.folder;
		} else {
			const internalDailyNotes = (this.app as any).internalPlugins?.plugins?.["daily-notes"];
			if (internalDailyNotes && internalDailyNotes?.instance?.options?.folder !== undefined) {
				dailyNoteFolder = internalDailyNotes.instance.options.folder;
			}
		}
		const files = this.app.vault.getFiles();
		let dailyNoteFiles: any[];
		if (!dailyNoteFolder) {
			dailyNoteFiles = files.filter((file: any) => !file.path.includes("/"));
		} else {
			dailyNoteFiles = files.filter((file: any) => file.path.startsWith(dailyNoteFolder + "/"));
		}

		const yearSet = new Set<string>();
		const yearRegex = /^(\d{4})-\d{2}-\d{2}$/;
		const pathYearRegex = /(\d{4})-\d{2}-\d{2}\.md$/;
		for (const file of dailyNoteFiles) {
			const baseMatch = file.basename.match(yearRegex);
			const pathMatch = file.path.match(pathYearRegex);
			if (baseMatch) {
				yearSet.add(baseMatch[1]);
			} else if (pathMatch) {
				yearSet.add(pathMatch[1]);
			}
		}
		const yearList = Array.from(yearSet).sort();

		const yearDiaryMap: Record<string, Record<string, string | undefined>> = {};
		for (const year of yearList) {
			const dateMap: Record<string, string | undefined> = {};
			const startDate = new Date(Number(year), 0, 1);
			const endDate = new Date(Number(year), 11, 31);
			for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
				const mm = String(d.getMonth() + 1).padStart(2, "0");
				const dd = String(d.getDate()).padStart(2, "0");
				const dateStr = `${year}-${mm}-${dd}`;
				const file = dailyNoteFiles.find((f: any) => f.basename === dateStr);
				dateMap[dateStr] = file ? file.path : undefined;
			}
			yearDiaryMap[year] = dateMap;
		}
		return yearDiaryMap;
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

// 年度比較用カスタムビュー
class YearlyDiaryCompareView extends ItemView {
	plugin: YearlyDiaryComparatorPlugin;
	_renderTableHandler: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: YearlyDiaryComparatorPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_YEARLY_DIARY_COMPARE;
	}

	getDisplayText() {
		return "年度比較ビュー";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl("h2", { text: "年度比較ビュー" });
		const yearDiaryMap = await this.plugin.getYearDiaryMap();
		const yearList = Object.keys(yearDiaryMap).sort();

		// テーブルを横スクロール可能なラッパーで囲む
		const tableWrapper = container.createEl("div");
		tableWrapper.setAttr("style", "overflow-x: auto; overflow-y: auto; height: 100%; min-height: 100%;");
		const yearColCount = yearList.length;
		const dateColWidth = 56;
		const yearColWidth = 480;
		const minTableWidth = dateColWidth + yearColWidth * yearColCount;
		const table = tableWrapper.createEl("table");
		table.setAttr("style", `border-collapse: collapse; min-width: ${minTableWidth}px; table-layout: fixed;`);
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		const tbody = table.createEl("tbody");

		const plugin = this.plugin;
		const renderTable = () => {
			const thStyle = `border: 1px solid #888; padding: 4px; background: #222; width: ${dateColWidth}px; min-width: ${dateColWidth}px; max-width: ${dateColWidth}px; white-space: nowrap; color: #fff; position: sticky; left: 0; top: 0; z-index: 11;`;
			const thYearStyle = `border: 1px solid #888; padding: 4px; background: #f0f0f0; width: ${yearColWidth}px; min-width: ${yearColWidth}px; max-width: ${yearColWidth}px; color: #000; position: sticky; top: 0; z-index: 10;`;

			thead.empty();
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", { text: "日付", attr: { style: thStyle } });
			for (const year of yearList) {
				headerRow.createEl("th", { text: year, attr: { style: thYearStyle } });
			}

			tbody.empty();
			const days: string[] = [];
			for (let month = 0; month < 12; month++) {
				for (let day = 1; day <= 31; day++) {
					const mm = String(month + 1).padStart(2, "0");
					const dd = String(day).padStart(2, "0");
					const dateStr = `XXXX-${mm}-${dd}`;
					if (new Date(`2020-${mm}-${dd}`).getMonth() + 1 !== month + 1) continue;
					days.push(`${mm}-${dd}`);
				}
			}
			for (const mmdd of days) {
				const row = tbody.createEl("tr");
				const tdStyle = `border: 1px solid #888; padding: 4px; width: ${dateColWidth}px; min-width: ${dateColWidth}px; max-width: ${dateColWidth}px; white-space: nowrap; position: sticky; left: 0; z-index: 1; background: #222; color: #fff;`;
				const tdYearStyle = `border: 1px solid #888; padding: 4px; width: ${yearColWidth}px; min-width: ${yearColWidth}px; max-width: ${yearColWidth}px;`;
				row.createEl("td", { text: mmdd, attr: { style: tdStyle } });
				for (const year of yearList) {
					const dateStr = `${year}-${mmdd}`;
					const filePath = yearDiaryMap[year][dateStr];
					const cell = row.createEl("td", { text: "", attr: { style: tdYearStyle } });
					if (filePath) {
						cell.setText("読み込み中...");
						const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
						if (file && file instanceof TFile) {
						this.plugin.app.vault.read(file).then(content => {
							// # [DAILY_SUMMARY]見出し以降、次の同レベル以上の見出しまでを抽出
							const lines = content.split('\n');
							const summaryIdx = lines.findIndex(line => /^#+\s*\[DAILY_SUMMARY\]/.test(line));
							if (summaryIdx !== -1) {
								const summaryLevel = (lines[summaryIdx].match(/^#+/) || ['#'])[0].length;
								let endIdx = lines.length;
								for (let i = summaryIdx + 1; i < lines.length; i++) {
									const m = lines[i].match(/^(#+)\s+/);
									if (m && m[1].length <= summaryLevel) {
										endIdx = i;
										break;
									}
								}
								const summary = lines.slice(summaryIdx + 1, endIdx).join('\n').trim();
								if (summary) {
									// 先に中身をクリア
									cell.innerHTML = "";
									// ObsidianのMarkdownRendererでマークダウンをHTMLに変換して表示
									MarkdownRenderer.renderMarkdown(
										summary,
										cell,
										"",
										plugin
									);
								} else {
									cell.setText("(まとめなし)");
								}
							} else {
								cell.setText("");
							}
						}).catch((err) => {
							console.error("Markdown render error:", err);
							cell.setText("(読み込み失敗)");
						});
						} else {
							cell.setText("(ファイルなし)");
						}
					}
				}
			}
		};

		renderTable();
		// 最新の年が右端に来るように自動スクロール（遅延実行で確実に反映）
		setTimeout(() => {
			tableWrapper.scrollLeft = tableWrapper.scrollWidth;
		}, 0);
		window.addEventListener("resize", renderTable);
		this._renderTableHandler = renderTable;
	}

	async onClose() {
		// クリーンアップ処理
		if (this._renderTableHandler) {
			window.removeEventListener("resize", this._renderTableHandler);
		}
	}
}
