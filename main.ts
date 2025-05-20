import {
	Plugin,
	WorkspaceLeaf,
	ItemView,
	MarkdownRenderer,
	App,
	PluginSettingTab,
	Setting,
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
 * Main View
 */
const VIEW_TYPE_YEARLY_DIARY_COMPARE = "yearly-diary-compare-view";
export default class YearlyDiaryComparatorPlugin extends Plugin {
	settings: YearlyDiaryComparatorSettings;
	async onload() {
		await this.loadSettings();
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
		// do clean up if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

        // Get files in specified folder
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
					(f: any) => f.basename === dateStr
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


    private showDailyNote = (app:App, filePath:string) =>{
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
    }

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

        // Define title of view
		const titleWrapper = container.createEl("div", { attr: { style: "display: flex; align-items: center; gap: 8px;" } });
		titleWrapper.createEl("h2", { text: "Yearly diary comparator", attr: { style: "margin: 0;" } });
        // Add reload button to title
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

		// Wrap table with scrollable
		const tableWrapper = container.createEl("div");
		tableWrapper.setAttr(
			"style",
			"overflow-x: auto; overflow-y: auto; height: 100%; min-height: 100%;"
		);

		const yearColCount = yearList.length;
		const dayColWidth = 56;
		const yearColWidth = this.plugin.settings.yearColWidth;
		const minTableWidth = dayColWidth + yearColWidth * yearColCount;
		const table = tableWrapper.createEl("table");
		table.setAttr(
			"style",
			`border-collapse: collapse; min-width: ${minTableWidth}px; table-layout: fixed;`
		);
		const thead = table.createEl("thead");
		const tbody = table.createEl("tbody");

		// define 366days include leap day
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
            const zIndexTableHeaderDay = 11;
            const zIndexTableHeaderYear = 10;
            const zIndexTableDataDay = 1;

            const baseStyle = [
				`border: 1px solid var(--background-modifier-border)`,
				`padding: 4px`,
                `color: var(--text-normal)`
            ];
            const dayWidthStyle = [
                `width: ${dayColWidth}px`,
				`min-width: ${dayColWidth}px`,
				`max-width: ${dayColWidth}px`,
                `white-space: nowrap`,
                "background: var(--background-secondary)"
            ]
            const yearWidthStyle = [
                `width: ${yearColWidth}px`,
				`min-width: ${yearColWidth}px`,
				`max-width: ${yearColWidth}px`,
                `background: var(--background-primary)`,
            ]
            const hiLightStyle = [
                "background: var(--color-accent)",
                "color: var(--background-primary)",
                "font-weight: bold"
            ];

            const thDayStyle = [
                ...baseStyle,
                ...dayWidthStyle,
				`position: sticky`,
				`left: 0`,
				`top: 0`,
				`z-index: ${zIndexTableHeaderDay}`,
            ].join(";");

			const thYearStyle = [
                ...baseStyle,
                ...yearWidthStyle,
				`position: sticky`,
				`top: 0`,
				`z-index: ${zIndexTableHeaderYear}`,
            ].join(";");

            const tdYearStyle = [
                ...baseStyle,
                ...yearWidthStyle,
            ].join(";");


			thead.empty();
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", {
				text: "day",
				attr: { style: thDayStyle },
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

            // Create cell for 366 days
			for (const mmdd of days) {
                // Define tdDayStyle dynamically
				const styles = [
                    ...baseStyle,
                    ...dayWidthStyle,
					`position: sticky`,
					`left: 0`,
					`z-index: ${zIndexTableDataDay}`,
                ];
				// hi-light today
				if (mmdd === todayStr) {
                    styles.push(...hiLightStyle)
				}
                const tdDayStyle = styles.join(";")

                // Create cells for years
				const row = tbody.createEl("tr");
				row.createEl("td", { text: mmdd, attr: { style: tdDayStyle } });
				for (const year of yearList) {
                    // Defile filepath
					const dateStr = `${year}-${mmdd}`;
					const filePath = yearDiaryMap[year][dateStr];
					if (filePath) {
                        const cell = row.createEl("td", {
                            text: "",
                            attr: { style: tdYearStyle },
                        });
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
									// # Extract content from a heading until the next heading of the same or higher level.
									const lines = content.split("\n");
									const headingPattern = this.plugin.settings.summaryHeading.trim();
									const headingRegex = new RegExp("^#+\\s*" + headingPattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
                                    // Find summary line number
									const summaryLineNum = lines.findIndex((line) =>
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
                                        await this.showDailyNote(plugin.app, filePath)
									});
									cell.appendChild(iconSpan);

									if (summaryLineNum !== -1) {
                                        // Get level of summary
										const summaryLevel = (lines[summaryLineNum].match(/^#+/) || ["#"])[0].length;
										let endLineNum = lines.length;
										for (let i = summaryLineNum + 1; i < lines.length; i++) {
											const m = lines[i].match(/^(#+)\s+/);
											if ( m && m[1].length <= summaryLevel ) {
												endLineNum = i;
												break;
											}
										}

                                        // Get summary
										const summary = lines
											.slice(summaryLineNum + 1, endLineNum)
											.join("\n")
											.trim();

										if (summary) {
											// Obsidianの型定義が4引数形式のみ対応のため、旧形式で呼び出し
											// TODO: ObsidianのAPIが新形式に対応したら書き換え
											MarkdownRenderer.render(
                                                this.app,
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
                            await this.showDailyNote(plugin.app, filePath)
                        });
					}
				}
			}
		};

		reloadBtn.addEventListener("click", () => {
			renderTable();
		});

		renderTable();
		// Automatically scroll so that the latest year appears on the right edge, and today is centered vertically (with delayed execution to ensure proper rendering).
		setTimeout(() => {
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
				const totalHeight = Array.from(trList).reduce((sum, tr) => sum + (tr.offsetHeight ?? 24), 0);
				let scrollTop = top - (visibleHeight / 2) + (rowHeight / 2);
				scrollTop = Math.max(0, Math.min(scrollTop, totalHeight - visibleHeight));
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
