# LOG PWA domain v1

`domain.mjs` 是手機 PWA 的獨立資料與規則試排核心，使用標準 JavaScript ES modules，沒有外部依賴。它不讀寫 XLSM，也不代表 2027-10 VBA 已全部移植或通過原生驗收。

核心 exports（包含相容入口）：`DEFAULT_SETTINGS`、`PLANTS`、`parseClock`、`formatClock`、`formatDuration`、`parseRows`、`plantSupport`、`reparsePendingRows`、`makeDemo`、`autocolor`、`validateSettings`、`solvePreview`、`isSpecial`、`colorTimeGuide`。

`colorTimeGuide(settings)` 供操作說明讀取目前難度、跨區與進場設定；背景、黃字、特殊與樓層表直接共用求解器規則，回傳的樓層上下限已包含背景。

目前支援：依工作簿實際廠別清單選擇來源；一般 B→D／C→E，油料二、基礎油、油品部成品課反轉，`reverse` 再對調；ARO1、ARO2、ARO3、PP、OL2、MA、BG2、李長榮、易增依「廠別規則」解析；FAS、大連、南北儲、中油、油料二、基礎油、油品部成品課、南儲各依前綴或變長規則。示範廠才接受明確標籤語法。D/E 原碼不補字、不刪字、不截短。另有合成示範資料、設備／樓層／跨區標色、29 列以前完整小組補藍、1–27 層實際純移動表、首筆從 1F、返回 1F、普通／背景、CPRSAI 單次 60 秒、黃字 60–89 秒、跨區、逐列遠距、完整小組午休切點、普通三連同秒與同半日 80 間隔 3660 秒試排。成功結果會重新建立逐列上下限並獨立核對時間鏈、首筆、返回、特殊與窗口。

限制：INA、PVC、手動依原設定保留人工；精確人工解析例外未自動套入，南儲可靠空小組尚未有下游表示方式，仍保留空值及明確issue。人工色彩所有權、少筆延長、單點跨區通融、候選池、舊方案品質保留、區域換位及 Excel 交易式寫入也尚未移植。來源不能可靠解析時保留原碼並加入 `issues`；任何 issue、未知樓層或未知完整小組都會拒絕試排。`solvePreview` 使用有界的確定性貪婪配置；失敗只表示第一版未找到方案，不表示數學無解。正式使用仍須由 2027-10 流程獨立驗算。

`withSessionBackgrounds` 對成功排程的上午／下午首筆補正式黃底並保留紅底；進場仍使用原首筆規則，不重複加背景秒數。`job-rows.mjs`讓畫面與A/B共用當次底色，舊存檔也能修正；新排程不繼承過期的午休切點標色。

`measurements.mjs` 對應LOG A/B：A背景段首抽值、段內沿用，B逐筆抽值；兩序列分別禁止相鄰與隔筆同值，午休本身不重設防重序列。範圍由活頁簿預設0.8～2.7／0.8～4.9起算，1000兩位、2020一位。生成前UI要求完整有效時間；人工A更新整段，B只更新單列。

`txt-export.mjs` 是純函式固定格式輸出：只接受1～448筆完整時間與非負有限A/B，依D或E原碼組成1000兩位／2020一位小數的110字主體，包含現行六行檔頭、英月日期、二校重複檔頭、UTF-8無BOM、CRLF、大小寫副檔名及不同尾行。代碼超過16字、非ASCII、二校在所選來源找不到、必要欄位或任何110字檢查失敗都直接拒絕，不截字。`txt-output-ui.mjs` 在目前結果、背景及A/B重新核對通過後提供預覽與本機下載；本機下載不經伺服器。

跨裝置取件只在使用者明確按「加密上傳」後執行。`txt-transfer.mjs` 在客戶端產生256-bit隨機鑰匙，以AES-GCM加密包含檔名與TXT bytes的完整JSON；Worker只收到 `{id,iv,ciphertext}`，其中ID是鑰匙的SHA-256，解密鑰匙只由本機紀錄及使用者持有。上傳成功收據必須回傳相同ID及固定12小時期限；不確定失敗保留pending包與鑰匙，不自動重送，應先GET確認。取件回應有512 KiB加少量metadata的串流上限與涵蓋body的timeout，解密及驗證都在客戶端完成。

`cloudflare/worker.mjs` 使用KV binding `LOG_TXT` 保存密文，期限從第一次成功接受起12小時；GET與相同內容的重送不續期，同ID不同內容拒絕。上傳request body上限512 KiB，正式CORS來源只有 `https://yang-00712.github.io`；本機4177／4178需明確開發旗標。`LOG_RATE` binding存在且部署為30次／60秒時，依Cloudflare提供的來源IP限制POST／GET；binding缺席時程式不宣稱有限流。CORS與限流不是認證，KV跨PoP並發首次寫入也不提供強原子保證。

`manual-time.mjs` 是獨立手動候選，沒有呼叫自動求解器。基礎＋Rand取整數秒，新建候選schema 2用上午／下午獨立抽樣序列（steps／pmSteps）；舊schema 1共用序列讀取後保持原值；排除索引各自保存，刪除只跨過時刻並累加間隔，不移除元件。映射需完整足量、保持元件次序；UI依主設定重算首筆實際等待。`inspectManualSchedule` 重用逐列上下限、完整小組、樓層、返回及80窗核對，不修改手動時刻。`manualResult.ok` 表示成功套用，`rulesOk` 才是規則通過；不能混同。

`job-rows.mjs` 的 `activeResult` 依 `timeMode` 選擇獨立的 `result`／`manualResult`。來源修訂使兩者過期；候選草稿修訂不改已套用結果。手動候選上限10000步、撤回20步；不足筆數、錯誤索引與非法卡夾皆拒絕，不截短。

`manualIntervalGuides` 直接讀取求解與驗證共用的逐列範圍，包含首筆、背景、樓層、CPRSAI與遠距，未知樓層不猜測。`manual-preview.mjs` 將保留時刻對應目前元件，選取刪除時預覽新映射；首筆間隔從主設定開始計算。新舊schema皆經逐時段終點、步長、排除索引驗證；不把舊保存候選偷偷重抽。

手動schema 3保留已驗證的亂數底稿並加入 `adjustments.am/pm` 整數秒差映射。普通步驟套差後至少1秒，首個候選允許相對候選起點前移但不跨出當日；排除索引依原池驗證，延長後暫時超出終點的記號不遺失。`setManualInterval` 修改保留間隔，縮短合併段會分配到被跨過的小步，確保還原後仍按時序。`setManualMappedTimes` 一次回填調整提案，避免逐筆中途延長把後續候選擠掉。舊schema唯讀保持原值，第一次修改才升級。`manualDraftRows` 用完整有效候選依來源次序生成暫存序列；G由 `windowReport` 即時驗算，無效或不足窗口不假造數字。

`manual-adjust.mjs` 在Worker被明確呼叫，將逐筆上下限、80間隔至少3660秒、半日總量與返回範圍建成整數差分限制，先尋找可行解，再以有限搜尋貼近原間隔並避開普通三連同秒。固定元件、順序、顏色、AM/PM切點；所有成功方案再交 `inspectManualSchedule` 檢查。三連分布搜尋失敗不表示線性限制數學無解。UI持有 job/revision/manualRevision 令牌，過期方案拒絕；採用到候選後重新映射逐筆比對並驗算，已套用結果仍須另按套用。

`plant-parser.mjs` 以2027-10的廠別規則、區域對照、TimeConfig別名及共用VBA分流為來源；AF～IF與4.5→4照實際別名表。油類核對長短區碼別名、忽略括號註記、依明確規則補未標樓層；非法樓層或未知短碼前綴不猜測。只有示範廠使用標籤語法。匯入不沿用上張卡夾廠別，先選廠並預覽前三筆。`reparsePendingRows` 只重判issues非空列，以既存d/e避免二次反轉；保留ID、原碼、標記及其他欄位。UI用既有撤回快照、來源revision和A/B分段核對處理失效；沒有issues的人工修正不覆蓋。真實來源僅在本機唯讀核對，公開測試採合成資料；此層通過不等於全部工廠完成全天排程驗收。

TXT純函式與合成測試通過只代表目前格式契約；Cloudflare線上部署、實體iPhone下載／取件，以及各廠資料在2027-10原生Excel的逐檔輸出仍是不同驗收層，不能互相替代。
