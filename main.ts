import {
	Plugin,
	WorkspaceLeaf,
	ItemView,
	TFile,
	MarkdownRenderer,
	App,
	PluginSettingTab,
	Setting,
} from "obsidian";

// プラグイン設定タブ
class YearlyDiaryComparatorSettingTab extends PluginSettingTab {
	plugin: YearlyDiaryComparatorPlugin;

	constructor(app: App, plugin: YearlyDiaryComparatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Extract keyword")
			.setDesc("Heading keyword to extract data from（eg, [DAILY_SUMMARY]）")
			.addText(text => text
				.setPlaceholder("[DAILY_SUMMARY]")
				.setValue(this.plugin.settings.summaryHeading)
				.onChange(async (value) => {
					this.plugin.settings.summaryHeading = value || "[DAILY_SUMMARY]";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Width of year columns")
			.setDesc("Width of year columns (eg. 480)")
			.addText(text => text
				.setPlaceholder("480")
				.setValue(String(this.plugin.settings.yearColWidth))
				.onChange(async (value) => {
					const num = Number(value);
					this.plugin.settings.yearColWidth = (!isNaN(num) && num > 0) ? num : 480;
					await this.plugin.saveSettings();
				}));
	}
}

/**
 * 年度ごとに日記を比較表示するObsidianプラグイン
 */
const VIEW_TYPE_YEARLY_DIARY_COMPARE = "yearly-diary-compare-view";

interface YearlyDiaryComparatorSettings {
	summaryHeading: string;
	yearColWidth: number;
}

const DEFAULT_SETTINGS: YearlyDiaryComparatorSettings = {
	summaryHeading: "[DAILY_SUMMARY]",
	yearColWidth: 480,
};

export default class YearlyDiaryComparatorPlugin extends Plugin {
	settings: YearlyDiaryComparatorSettings;
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new YearlyDiaryComparatorSettingTab(this.app, this));
		// 左リボンに年度比較リスト表示ボタンを追加
		this.addRibbonIcon("columns-3", "Open yearly comparator", () => {
			const leaves = this.app.workspace.getLeavesOfType(
				VIEW_TYPE_YEARLY_DIARY_COMPARE
			);
			if (leaves.length > 0) {
				leaves[0].detach();
			} else {
				this.activateView();
			}
		});

		// コマンド追加: 年度比較ビューを開く
		this.addCommand({
			id: "open-yearly-diary-compare-view",
			name: "Open yearly comparator",
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
		const existingLeaf = workspace.getLeavesOfType(
			VIEW_TYPE_YEARLY_DIARY_COMPARE
		)[0];
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

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 年度ごとの日記データ構造を取得
	 */
	async getYearDiaryMap(): Promise<
		Record<string, Record<string, string | undefined>>
	> {
		let dailyNoteFolder: string | undefined = undefined;
		const dailyNotesPlugin = (this.app as any).plugins?.getPlugin?.(
			"daily-notes"
		);

		if (
			dailyNotesPlugin &&
			typeof dailyNotesPlugin?.options?.folder === "string"
		) {
			dailyNoteFolder = dailyNotesPlugin.options.folder;
		} else {
			const internalDailyNotes = (this.app as any).internalPlugins
				?.plugins?.["daily-notes"];
			if (
				internalDailyNotes &&
				internalDailyNotes?.instance?.options?.folder !== undefined
			) {
				dailyNoteFolder = internalDailyNotes.instance.options.folder;
			}
		}
		const files = this.app.vault.getFiles();
		let dailyNoteFiles: any[];
		if (!dailyNoteFolder) {
			dailyNoteFiles = files.filter(
				(file: any) => !file.path.includes("/")
			);
		} else {
			dailyNoteFiles = files.filter((file: any) =>
				file.path.startsWith(dailyNoteFolder + "/")
			);
		}

		// console.log("Daily Note Folder:", dailyNoteFolder ?? "(Vault root)");
		// console.log(
		// 	"Daily Note Files:",
		// 	dailyNoteFiles.map((f) => f.path)
		// );

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

		const yearDiaryMap: Record<
			string,
			Record<string, string | undefined>
		> = {};
		for (const year of yearList) {
			const dateMap: Record<string, string | undefined> = {};
			const startDate = new Date(Number(year), 0, 1);
			const endDate = new Date(Number(year), 11, 31);
			for (
				let d = new Date(startDate);
				d <= endDate;
				d.setDate(d.getDate() + 1)
			) {
				const mm = String(d.getMonth() + 1).padStart(2, "0");
				const dd = String(d.getDate()).padStart(2, "0");
				const dateStr = `${year}-${mm}-${dd}`;
				const file = dailyNoteFiles.find(
					(f: any) => f.basename === dateStr
				);
				dateMap[dateStr] = file ? file.path : undefined;
			}
			yearDiaryMap[year] = dateMap;
		}
		return yearDiaryMap;
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
		return "Yearly diary comparator";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		const titleWrapper = container.createEl("div", { attr: { style: "display: flex; align-items: center; gap: 8px;" } });
		titleWrapper.createEl("h2", { text: "Yearly diary comparator", attr: { style: "margin: 0;" } });
		const reloadBtn = titleWrapper.createEl("button", { attr: { style: "display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; cursor: pointer; border: none; background: transparent; padding: 0; margin-left: 4px;" } });
		reloadBtn.title = "Reload table";
		const iconSpan = document.createElement("span");
		iconSpan.textContent = "⟳";
		iconSpan.style.fontSize = "2rem";
		iconSpan.style.cursor = "pointer";
		iconSpan.title = "reload table";
		reloadBtn.appendChild(iconSpan);

        const yearDiaryMap = await this.plugin.getYearDiaryMap();
		const yearList = Object.keys(yearDiaryMap).sort();

		// テーブルを横スクロール可能なラッパーで囲む
		const tableWrapper = container.createEl("div");
		tableWrapper.setAttr(
			"style",
			"overflow-x: auto; overflow-y: auto; height: 100%; min-height: 100%;"
		);
		const yearColCount = yearList.length;
		const dateColWidth = 56;
		const yearColWidth = this.plugin.settings.yearColWidth;
		const minTableWidth = dateColWidth + yearColWidth * yearColCount;
		const table = tableWrapper.createEl("table");
		table.setAttr(
			"style",
			`border-collapse: collapse; min-width: ${minTableWidth}px; table-layout: fixed;`
		);
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		const tbody = table.createEl("tbody");

		// days配列をonOpenスコープで定義
		const days: string[] = [];
		for (let month = 0; month < 12; month++) {
			for (let day = 1; day <= 31; day++) {
				const mm = String(month + 1).padStart(2, "0");
				const dd = String(day).padStart(2, "0");
				const dateStr = `XXXX-${mm}-${dd}`;
				if (
					new Date(`2020-${mm}-${dd}`).getMonth() + 1 !==
					month + 1
				)
					continue;
				days.push(`${mm}-${dd}`);
			}
		}

		const plugin = this.plugin;
		const renderTable = () => {
			// styles are hard coded because I can not make header sticky without hard coded styles.
			const thStyle = `
				border: 1px solid var(--background-modifier-border);
				padding: 4px;
				background: var(--background-secondary);
				width: ${dateColWidth}px;
				min-width: ${dateColWidth}px;
				max-width: ${dateColWidth}px;
				white-space: nowrap;
				color: var(--text-normal);
				position: sticky;
				left: 0;
				top: 0;
				z-index: 11;
			`;
			const thYearStyle = `
				border: 1px solid var(--background-modifier-border);
				padding: 4px;
				background: var(--background-primary);
				width: ${yearColWidth}px;
				min-width: ${yearColWidth}px;
				max-width: ${yearColWidth}px;
				color: var(--text-normal);
				position: sticky;
				top: 0;
				z-index: 10;
			`;

			thead.empty();
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", {
				text: "day",
				attr: { style: thStyle },
			});
			for (const year of yearList) {
				headerRow.createEl("th", {
					text: year,
					attr: { style: thYearStyle },
				});
			}

			tbody.empty();
			const days: string[] = [];
			for (let month = 0; month < 12; month++) {
				for (let day = 1; day <= 31; day++) {
					const mm = String(month + 1).padStart(2, "0");
					const dd = String(day).padStart(2, "0");
					const dateStr = `XXXX-${mm}-${dd}`;
					if (
						new Date(`2020-${mm}-${dd}`).getMonth() + 1 !==
						month + 1
					)
						continue;
					days.push(`${mm}-${dd}`);
				}
			}
			const today = new Date();
			const todayStr = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
			for (const mmdd of days) {
				const row = tbody.createEl("tr");
				let tdStyle = `
					border: 1px solid var(--background-modifier-border);
					padding: 4px;
					width: ${dateColWidth}px;
					min-width: ${dateColWidth}px;
					max-width: ${dateColWidth}px;
					white-space: nowrap;
					position: sticky;
					left: 0;
					z-index: 1;
					background: var(--background-secondary);
					color: var(--text-normal);
				`;
				// hi-light today
				if (mmdd === todayStr) {
					tdStyle += "background: var(--color-accent); color: var(--background-primary); font-weight: bold;";
				}
				const tdYearStyle = `
					border: 1px solid var(--background-modifier-border);
					padding: 4px;
					width: ${yearColWidth}px;
					min-width: ${yearColWidth}px;
					max-width: ${yearColWidth}px;
					background: var(--background-primary);
					color: var(--text-normal);
				`;
				row.createEl("td", { text: mmdd, attr: { style: tdStyle } });
				for (const year of yearList) {
					const dateStr = `${year}-${mmdd}`;
					const filePath = yearDiaryMap[year][dateStr];
					const cell = row.createEl("td", {
						text: "",
						attr: { style: tdYearStyle },
					});
					if (filePath) {
						cell.addClass("clickable-diary-cell");
						cell.setText("loading...");
						cell.setAttr(
							"title",
							"open note"
						);
						cell.style.cursor = "pointer";
						const file = this.plugin.app.vault.getFileByPath(filePath);
						if (file) {
							(async () => {
								try {
									const content = await this.plugin.app.vault.read(file);
									// # headingPattern 見出し以降、次の同レベル以上の見出しまでを抽出
									const lines = content.split("\n");
									const headingPattern = this.plugin.settings.summaryHeading.trim();
									const headingRegex = new RegExp("^#+\\s*" + headingPattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
									const summaryIdx = lines.findIndex((line) =>
										headingRegex.test(line)
									);
									cell.empty();
									const iconSpan = document.createElement("span");
									iconSpan.textContent = "📄";
									iconSpan.style.cursor = "pointer";
									iconSpan.title = "open note";
									iconSpan.style.marginRight = "4px";
									iconSpan.addEventListener("click", async (e) => {
										e.stopPropagation();
										const file = plugin.app.vault.getFileByPath(filePath);
										if (file) {
											const centerLeaf = plugin.app.workspace.getLeaf(false);
											if (centerLeaf) {
												await centerLeaf.openFile(file, { active: true });
												plugin.app.workspace.revealLeaf(centerLeaf);
											}
										}
									});
									cell.appendChild(iconSpan);

									if (summaryIdx !== -1) {
										const summaryLevel = (lines[
											summaryIdx
										].match(/^#+/) || ["#"])[0].length;
										let endIdx = lines.length;
										for (
											let i = summaryIdx + 1;
											i < lines.length;
											i++
										) {
											const m =
												lines[i].match(/^(#+)\s+/);
											if (
												m &&
												m[1].length <= summaryLevel
											) {
												endIdx = i;
												break;
											}
										}
										const summary = lines
											.slice(summaryIdx + 1, endIdx)
											.join("\n")
											.trim();

                                            cell.appendChild(iconSpan);
										if (summary) {
											MarkdownRenderer.renderMarkdown(
												summary,
												cell,
												"",
												plugin
											);
										} else {
											const noneSpan = document.createElement("span");
											cell.appendChild(noneSpan);
										}
									}
								} catch (err) {
									console.error(
										"Markdown render error:",
										err
									);
									cell.setText("(read error)");
								}
							})();
						} else {
							cell.setText("(no file found)");
						}
						cell.addEventListener("click", async () => {
							const file = this.plugin.app.vault.getFileByPath(filePath);
							if (file) {
								const centerLeaf = this.plugin.app.workspace.getLeaf(false);
								if (centerLeaf) {
									await centerLeaf.openFile(file, {
										active: true,
									});
									this.plugin.app.workspace.revealLeaf(centerLeaf);
								}
							}
						});
					}
				}
			}
		};

		reloadBtn.addEventListener("click", () => {
			renderTable();
		});

		renderTable();
		// 最新の年が右端に来るように自動スクロール＆今日が縦中央に来るようにスクロール（遅延実行で確実に反映）
		setTimeout(() => {
			// 横方向（年）スクロール
			tableWrapper.scrollLeft = tableWrapper.scrollWidth;

			// 縦方向（今日）スクロール
			const today = new Date();
			const mm = String(today.getMonth() + 1).padStart(2, "0");
			const dd = String(today.getDate()).padStart(2, "0");
			const todayStr = `${mm}-${dd}`;
			const rowIndex = days.indexOf(todayStr);
			if (rowIndex !== -1) {
				// tbody内のtrを取得
				const trList = tbody.querySelectorAll("tr");
				const rowHeight = trList[0]?.offsetHeight ?? 24;
				const visibleHeight = tableWrapper.clientHeight;
				const totalHeight = rowHeight * days.length;
				let scrollTop = rowHeight * rowIndex - (visibleHeight / 2) + (rowHeight / 2);
				scrollTop = Math.max(0, Math.min(scrollTop, totalHeight - visibleHeight));
				tableWrapper.scrollTop = scrollTop;
			}
		}, 0);
		window.addEventListener("resize", renderTable);
		this._renderTableHandler = renderTable;
	}

	async onClose() {
		// クリーンアップ処理
		if (this._renderTableHandler) {
			window.removeEventListener("resize", this._renderTableHandler);
			this._renderTableHandler = null;
		}
		// DOMノードのクリーンアップ
		const container = this.containerEl.children[1];
		if (container) {
			container.empty();
		}
	}
}
