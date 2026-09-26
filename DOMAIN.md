# LOG PWA domain v1

`domain.mjs` 是手機 PWA 的獨立資料與規則試排核心，使用標準 JavaScript ES modules，沒有外部依賴。它不讀寫 XLSM，也不代表 2027-10 VBA 已移植或驗收。

固定 exports：`DEFAULT_SETTINGS`、`PLANTS`、`parseClock`、`formatClock`、`formatDuration`、`parseRows`、`makeDemo`、`autocolor`、`validateSettings`、`solvePreview`、`isSpecial`、`colorTimeGuide`。

`colorTimeGuide(settings)` 供操作說明讀取目前難度、跨區與進場設定；背景、黃字、特殊與樓層表直接共用求解器規則，回傳的樓層上下限已包含背景。

目前支援：依工作簿實際廠別清單選擇來源；一般 B→D／C→E，油料二、基礎油、油品部成品課反轉，`reverse` 再對調；ARO1、ARO2、ARO3、PP、OL2、MA、BG2、李長榮、易增依「廠別規則」固定位置解析；示範廠才接受明確標籤語法。D/E 原碼不補字、不刪字、不截短。另有合成示範資料、設備／樓層／跨區標色、29 列以前完整小組補藍、1–27 層實際純移動表、首筆從 1F、返回 1F、普通／背景、CPRSAI 單次 60 秒、黃字 60–89 秒、跨區、逐列遠距、完整小組午休切點、普通三連同秒與同半日 80 間隔 3660 秒試排。成功結果會重新建立逐列上下限並獨立核對時間鏈、首筆、返回、特殊與窗口。

限制：FAS、INA、PVC、大連、南北儲、中油、三個油類廠別、南儲、手動等變長／前綴／例外解析尚未移植；別名樓層、人工色彩所有權、少筆延長、單點跨區通融、候選池、舊方案品質保留、區域換位及 Excel 交易式寫入也尚未移植。來源不能可靠解析時保留原碼並加入 `issues`；任何 issue、未知樓層或未知完整小組都會拒絕試排。`solvePreview` 使用有界的確定性貪婪配置；失敗只表示第一版未找到方案，不表示數學無解。正式使用仍須由 2027-10 流程獨立驗算。

`withSessionBackgrounds` 對成功排程的上午／下午首筆補正式黃底並保留紅底；進場仍使用原首筆規則，不重複加背景秒數。`job-rows.mjs`讓畫面與A/B共用當次底色，舊存檔也能修正；新排程不繼承過期的午休切點標色。

`measurements.mjs` 對應LOG A/B：A背景段首抽值、段內沿用，B逐筆抽值；兩序列分別禁止相鄰與隔筆同值，午休本身不重設防重序列。範圍由活頁簿預設0.8～2.7／0.8～4.9起算，1000兩位、2020一位。生成前UI要求完整有效時間；人工A更新整段，B只更新單列。TXT輸出尚未包含。

`manual-time.mjs` 是獨立手動候選，沒有呼叫自動求解器。基礎＋Rand取整數秒，新建候選schema 2用上午／下午獨立抽樣序列（steps／pmSteps）；舊schema 1共用序列讀取後保持原值；排除索引各自保存，刪除只跨過時刻並累加間隔，不移除元件。映射需完整足量、保持元件次序；UI依主設定重算首筆實際等待。`inspectManualSchedule` 重用逐列上下限、完整小組、樓層、返回及80窗核對，不修改手動時刻。`manualResult.ok` 表示成功套用，`rulesOk` 才是規則通過；不能混同。

`job-rows.mjs` 的 `activeResult` 依 `timeMode` 選擇獨立的 `result`／`manualResult`。來源修訂使兩者過期；候選草稿修訂不改已套用結果。手動候選上限10000步、撤回20步；不足筆數、錯誤索引與非法卡夾皆拒絕，不截短。

`manualIntervalGuides` 直接讀取求解與驗證共用的逐列範圍，包含首筆、背景、樓層、CPRSAI與遠距，未知樓層不猜測。`manual-preview.mjs` 將保留時刻對應目前元件，選取刪除時預覽新映射；首筆間隔從主設定開始計算。新舊schema皆經逐時段終點、步長、排除索引驗證；不把舊保存候選偷偷重抽。
