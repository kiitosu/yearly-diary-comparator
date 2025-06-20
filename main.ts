import {
	Plugin,
	WorkspaceLeaf,
	ItemView,
	MarkdownRenderer,
	App,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

// Settings for my plugin
interface YearlyDiaryComparatorSettings {
	summaryHeading: string;
	yearColWidth: number;
}

const DEFAULT_SETTINGS: YearlyDiaryComparatorSettings = {
	summaryHeading: "[DAILY_SUMMARY]",
	yearColWidth: 480,
};

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
			.setDesc(
				"Heading keyword to extract data from（eg, [DAILY_SUMMARY]）"
			)
			.addText((text) =>
				text
					.setPlaceholder("[DAILY_SUMMARY]")
					.setValue(this.plugin.settings.summaryHeading)
					.onChange(async (value) => {
						this.plugin.settings.summaryHeading =
							value || "[DAILY_SUMMARY]";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Width of year columns")
			.setDesc("Width of year columns (eg. 480)")
			.addText((text) =>
				text
					.setPlaceholder("480")
					.setValue(String(this.plugin.settings.yearColWidth))
					.onChange(async (value) => {
						const num = Number(value);
						this.plugin.settings.yearColWidth =
							!isNaN(num) && num > 0 ? num : 480;
						await this.plugin.saveSettings();
					})
			);
	}
}

/**
 * Main View
 */
const VIEW_TYPE_YEARLY_DIARY_COMPARE = "yearly-diary-compare-view";
export default class YearlyDiaryComparatorPlugin extends Plugin {
	settings: YearlyDiaryComparatorSettings;
	async onload() {
		await this.loadSettings();

		// styles.cssをheadに追加
		const cssPath = "styles.css";
		const cssId = "yearly-diary-comparator-style";
		const exist = document.getElementById(cssId);
		if (!exist) {
			try {
				const res = await fetch(cssPath);
				const css = await res.text();
				const style = document.head.createEl("style");
				style.id = cssId;
				style.textContent = css;
				document.head.appendChild(style);
			} catch (error) {
				console.error("Failed to load styles.css:", error);
			}
		}

		this.addSettingTab(new YearlyDiaryComparatorSettingTab(this.app, this));

		// add button to the ribbon
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

		// register view
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
		// headからstyle要素を削除
		const cssId = "yearly-diary-comparator-style";
		const style = document.getElementById(cssId);
		if (style) {
			style.remove();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(                      
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * function to get diary data
	 */ 
	async getYearDiaryMap(): Promise<
		Record<string, Record<string, string | undefined>>
	> {
		// Get folder dailyNote core plugin save notes
		let dailyNoteFolder: string | undefined = undefined;
		const internalDailyNotes = (this.app as any).internalPlugins
			?.plugins?.["daily-notes"];
		if (
			internalDailyNotes &&
			internalDailyNotes?.instance?.options?.folder !== undefined
		) {
			dailyNoteFolder = internalDailyNotes.instance.options.folder;
		}

		// Get files in specified folder
		const files = this.app.vault.getFiles();
		let dailyNoteFiles: TFile[];
		if (!dailyNoteFolder) {
			dailyNoteFiles = files.filter(
				(file: TFile) => !file.path.includes("/")
			);
		} else {
			dailyNoteFiles = files.filter((file: TFile) =>
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

		// Create map of diary each years
		const yearDiaryMap: Record<
			string,
			Record<string, string | undefined>
		> = {};
		for (const year of yearSet) {
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
					(f: TFile) => f.basename === dateStr
				);
				dateMap[dateStr] = file ? file.path : undefined;
			}
			yearDiaryMap[year] = dateMap;
		}
		return yearDiaryMap;
	}
}

// View to show comparison of diary
class YearlyDiaryCompareView extends ItemView {
	plugin: YearlyDiaryComparatorPlugin;
	// keep function to cleanup
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

	private showDailyNote = (app: App, filePath: string) => {
		const file = app.vault.getFileByPath(filePath);
		if (file) {
			const centerLeaf = this.plugin.app.workspace.getLeaf(false);
			if (centerLeaf) {
				centerLeaf.openFile(file, {
					active: true,
				});
				app.workspace.revealLeaf(centerLeaf);
			}
		}
	};

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// Define title of view
		const titleWrapper = container.createEl("div", { cls: "title-wrapper" });
		// Add reload button to title
		const reloadBtn = titleWrapper.createEl("button", { cls: "reload-btn" });
		reloadBtn.title = "Reload table";
		const iconSpan = reloadBtn.createSpan();
		iconSpan.textContent = "⟳";
		iconSpan.title = "reload table";
		iconSpan.className = "reload-icon";
		reloadBtn.appendChild(iconSpan);

		const yearDiaryMap = await this.plugin.getYearDiaryMap();
		const yearList = Object.keys(yearDiaryMap).sort();

		// Wrap table with scrollable
		const tableWrapper = container.createEl("div", { cls: "table-wrapper" });

		const yearColCount = yearList.length;
		const dayColWidth = 56;
		const yearColWidth = this.plugin.settings.yearColWidth;
		const minTableWidth = dayColWidth + yearColWidth * yearColCount;
		const table = tableWrapper.createEl("table", { cls: "yearly-diary-table" });
		table.style.minWidth = `${minTableWidth}px`;
		const thead = table.createEl("thead");
		const tbody = table.createEl("tbody");

		// define 366days include leap day
		const days: string[] = [];
		for (let month = 0; month < 12; month++) {
			for (let day = 1; day <= 31; day++) {
				const mm = String(month + 1).padStart(2, "0");
				const dd = String(day).padStart(2, "0");
				if (new Date(`2020-${mm}-${dd}`).getMonth() + 1 !== month + 1)
					continue;
				days.push(`${mm}-${dd}`);
			}
		}

		const plugin = this.plugin;
		const renderTable = () => {

			thead.empty();
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", {
				text: "day",
				cls: "th-day",
			});
			for (const year of yearList) {
				headerRow.createEl("th", {
					text: year,
					cls: "th-year",
				});
			}

			tbody.empty();
			const days: string[] = [];
			for (let month = 0; month < 12; month++) {
				for (let day = 1; day <= 31; day++) {
					const mm = String(month + 1).padStart(2, "0");
					const dd = String(day).padStart(2, "0");
					if (
						new Date(`2020-${mm}-${dd}`).getMonth() + 1 !==
						month + 1
					)
						continue;
					days.push(`${mm}-${dd}`);
				}
			}
			const today = new Date();
			const todayStr = `${String(today.getMonth() + 1).padStart(
				2,
				"0"
			)}-${String(today.getDate()).padStart(2, "0")}`;

			// Create cell for 366 days
			for (const mmdd of days) {
				// 今日かどうかでクラスを分岐
				const tdDayCls = mmdd === todayStr
					? "td-day today-highlight"
					: "td-day";

				// Create cells for years
				const row = tbody.createEl("tr");
				row.createEl("td", { text: mmdd, cls: tdDayCls });
				for (const year of yearList) {
					// Define filepath
					const dateStr = `${year}-${mmdd}`;
					const filePath = yearDiaryMap[year][dateStr];
					
					// 常にセルを作成する
					const cell = row.createEl("td", {
						text: "",
						cls: "td-year",
					});
					
					if (filePath) {
						// ファイルが存在する場合のみクリック可能にする
						cell.addClass("clickable-diary-cell");
						cell.setText("loading...");
						cell.setAttr("title", "open note");
						
						const file = this.plugin.app.vault.getFileByPath(filePath);
						if (file) {
							(async () => {
								try {
									const content =
										await this.plugin.app.vault.read(file);
									// # Extract content from a heading until the next heading of the same or higher level.
									const lines = content.split("\n");
									const headingPattern =
										this.plugin.settings.summaryHeading.trim();
									const headingRegex = new RegExp(
										"^#+\\s*" +
											headingPattern.replace(
												/[-\/\\^$*+?.()|[\]{}]/g,
												"\\$&"
											)
									);
									// Find summary line number
									const summaryLineNum = lines.findIndex(
										(line) => headingRegex.test(line)
									);
									cell.empty();
									const iconSpan = cell.createSpan();
									iconSpan.textContent = "📄";
									iconSpan.title = "open note";
									iconSpan.className = "open-note-icon";
									iconSpan.addEventListener(
										"click",
										async (e) => {
											e.stopPropagation();
											await this.showDailyNote(
												plugin.app,
												filePath
											);
										}
									);
									cell.appendChild(iconSpan);

									if (summaryLineNum !== -1) {
										// Get level of summary
										const summaryLevel = (lines[
											summaryLineNum
										].match(/^#+/) || ["#"])[0].length;
										let endLineNum = lines.length;
										for (
											let i = summaryLineNum + 1;
											i < lines.length;
											i++
										) {
											const m =
												lines[i].match(/^(#+)\s+/);
											if (
												m &&
												m[1].length <= summaryLevel
											) {
												endLineNum = i;
												break;
											}
										}

										// Get summary
										const summary = lines
											.slice(
												summaryLineNum + 1,
												endLineNum
											)
											.join("\n")
											.trim();

										if (summary) {
											MarkdownRenderer.render(
												this.app,
												summary,
												cell,
												"",
												plugin
											);
										} else {
											const noneSpan =
												cell.createSpan();
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
							await this.showDailyNote(plugin.app, filePath);
						});
					} else {
						// ファイルが存在しない場合は空のセルとして表示
						cell.setText("");
						cell.setAttr("title", "no note");
					}
				}
			}
		};

		reloadBtn.addEventListener("click", () => {
			renderTable();
		});

		renderTable();
		// Automatically scroll so that the latest year appears on the right edge, and today is centered vertically (with delayed execution to ensure proper rendering).
		window.setTimeout(() => {
			// horizontal scroll to right end
			tableWrapper.scrollLeft = tableWrapper.scrollWidth;

			// vertical scroll by day to center today
			const today = new Date();
			const mm = String(today.getMonth() + 1).padStart(2, "0");
			const dd = String(today.getDate()).padStart(2, "0");
			const todayStr = `${mm}-${dd}`;
			const rowIndex = days.indexOf(todayStr);
			if (rowIndex !== -1) {
				// tbody内のtrを取得
				const trList = tbody.querySelectorAll("tr");
				const visibleHeight = tableWrapper.clientHeight;
				// Calc hight to row of today
				let top = 0;
				for (let i = 0; i < rowIndex; i++) {
					top += trList[i].offsetHeight;
				}
				const rowHeight = trList[rowIndex]?.offsetHeight ?? 24;
				const totalHeight = Array.from(trList).reduce(
					(sum, tr) => sum + (tr.offsetHeight ?? 24),
					0
				);
				let scrollTop = top - visibleHeight / 2 + rowHeight / 2;
				scrollTop = Math.max(
					0,
					Math.min(scrollTop, totalHeight - visibleHeight)
				);
				tableWrapper.scrollTop = scrollTop;
			}
		}, 0);
		window.addEventListener("resize", renderTable);
		this._renderTableHandler = renderTable;
	}

	async onClose() {
		// Remove handler
		if (this._renderTableHandler) {
			window.removeEventListener("resize", this._renderTableHandler);
			this._renderTableHandler = null;
		}
		// Empty DOM
		const container = this.containerEl.children[1];
		if (container) {
			container.empty();
		}
	}
}
