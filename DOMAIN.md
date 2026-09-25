# LOG PWA domain v1

`domain.mjs` 是手機 PWA 的獨立資料與規則試排核心，使用標準 JavaScript ES modules，沒有外部依賴。它不讀寫 XLSM，也不代表 2027-10 VBA 已移植或驗收。

固定 exports：`DEFAULT_SETTINGS`、`PLANTS`、`parseClock`、`formatClock`、`formatDuration`、`parseRows`、`makeDemo`、`autocolor`、`validateSettings`、`solvePreview`。

目前支援：依工作簿實際廠別清單選擇來源；一般 B→D／C→E，油料二、基礎油、油品部成品課反轉，`reverse` 再對調；ARO1、ARO2、ARO3、PP、OL2、MA、BG2、李長榮、易增依「廠別規則」固定位置解析；示範廠才接受明確標籤語法。D/E 原碼不補字、不刪字、不截短。另有合成示範資料、設備／樓層／跨區標色、29 列以前完整小組補藍、1–27 層實際純移動表、首筆從 1F、返回 1F、普通／背景、CPRSAI 單次 60 秒、黃字 60–89 秒、跨區、逐列遠距、完整小組午休切點、普通三連同秒與同半日 80 間隔 3660 秒試排。成功結果會重新建立逐列上下限並獨立核對時間鏈、首筆、返回、特殊與窗口。

限制：FAS、INA、PVC、大連、南北儲、中油、三個油類廠別、南儲、手動等變長／前綴／例外解析尚未移植；別名樓層、人工色彩所有權、少筆延長、單點跨區通融、候選池、舊方案品質保留、區域換位及 Excel 交易式寫入也尚未移植。來源不能可靠解析時保留原碼並加入 `issues`；任何 issue、未知樓層或未知完整小組都會拒絕試排。`solvePreview` 使用有界的確定性貪婪配置；失敗只表示第一版未找到方案，不表示數學無解。正式使用仍須由 2027-10 流程獨立驗算。
