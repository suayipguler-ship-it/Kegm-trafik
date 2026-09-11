const { chromium } = require("playwright");
const fs = require("fs");

const TARGET_URL = "https://www.kiyiemniyeti.gov.tr/gemi_trafik_bilgi_sistemleri";

const BOGAZLAR = [
    { name: "ÇANAKKALE", aliases: ["ÇANAKKALE", "CANAKKALE"] },
    { name: "İSTANBUL", aliases: ["İSTANBUL", "ISTANBUL"] }
];

const YONLER = [
    { name: "GÜNEY-KUZEY", aliases: ["GÜNEY-KUZEY", "GUNEY-KUZEY"] },
    { name: "KUZEY-GÜNEY", aliases: ["KUZEY-GÜNEY", "KUZEY-GUNEY"] }
];

const HAREKETLER = [
    { name: "PLAN. GEÇİŞ", aliases: ["PLAN. GEÇİŞ", "PLAN GEÇİŞ", "PLAN. GECIS", "PLAN GECIS"] },
    { name: "GEÇİŞE HAZIR", aliases: ["GEÇİŞE HAZIR", "GEÇISE HAZIR", "GECISE HAZIR"] },
    { name: "BOĞAZDA", aliases: ["BOĞAZDA", "BOGAZDA"] }
];

const CONFIG = {
    headless: true,
    navigationTimeout: 45000,
    actionTimeout: 20000,
    afterQueryWait: 1200,
    historyDays: 365,
    saveDebugHtml: false,
    retryCount: 2
};

function cleanText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
    return cleanText(value)
        .toLocaleUpperCase("tr-TR")
        .replace(/İ/g, "I")
        .replace(/Ş/g, "S")
        .replace(/Ğ/g, "G")
        .replace(/Ü/g, "U")
        .replace(/Ö/g, "O")
        .replace(/Ç/g, "C")
        .replace(/Â/g, "A")
        .replace(/Î/g, "I")
        .replace(/Û/g, "U");
}

function parseDate(text) {
    if (!text) return 0;
    const value = cleanText(text);
    const match = value.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})\s+(\d{1,2}):(\d{2})/);
    if (!match) return 0;

    let year = Number(match[3]);
    if (year < 100) year += 2000;

    const date = new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), 0, 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function parseLength(value) {
    if (!value) return null;
    const normalized = cleanText(value).replace(",", ".");
    const number = parseFloat(normalized);
    return Number.isNaN(number) ? null : number;
}

function isHeaderRow(cells) {
    const text = normalizeText(cells.join(" "));
    return text.includes("GEMI ADI") || text.includes("SHIP NAME") || text.includes("GEMI TIPI");
}

async function findOptionByAliases(select, aliases) {
    const options = await select.locator("option").evaluateAll(opts =>
        opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
    );
    const wanted = aliases.map(normalizeText);

    for (const option of options) {
        const normalizedOption = normalizeText(option.text);
        if (wanted.some(x => normalizedOption === x || normalizedOption.includes(x) || x.includes(normalizedOption))) {
            return option;
        }
    }
    return null;
}

async function selectFilter(page, selectIndex, aliases, label) {
    const selects = page.locator("select");
    const count = await selects.count();
    if (count < 3) throw new Error(`KEGM formunda 3 seçim kutusu bulunamadı. Sayı: ${count}`);

    const select = selects.nth(selectIndex);
    const option = await findOptionByAliases(select, aliases);
    if (!option) {
        const available = await select.locator("option").allTextContents();
        throw new Error(`${label} bulunamadı. Aranan: ${aliases.join(", ")} | Mevcut: ${available.join(" | ")}`);
    }

    await select.selectOption({ value: option.value });
    return option.text;
}

async function readShipsFromTable(page, bogaz, yon, hareket) {
    const ships = [];
    const tables = page.locator("table");
    const tableCount = await tables.count();

    for (let tableIndex = 0; tableIndex < tableCount; tableIndex++) {
        const table = tables.nth(tableIndex);
        const rows = table.locator("tbody tr");
        const rowCount = await rows.count();

        for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            const row = rows.nth(rowIndex);
            const cells = await row.locator("td").allTextContents();
            const cols = cells.map(cleanText);

            if (cols.length < 6 || isHeaderRow(cols)) continue;

            let offset = 0;
            const firstColumn = normalizeText(cols[0]);
            if (firstColumn.includes("GEMI GECMISI") || firstColumn.includes("DETAY BILGILERI") || firstColumn.includes("HARITADA") || cols.length >= 9) {
                offset = 1;
            }

            const planlama = cols[offset] || "";
            const name = cols[offset + 1] || "";
            const len = cols[offset + 2] || "";
            const type = cols[offset + 3] || "";
            const pilotReq = cols[offset + 4] || "";
            const tug = cols[offset + 5] || "";
            const sp2 = cols[offset + 6] || "";
            const sp1 = cols[offset + 7] || "";

            if (!name) continue;

            const normalizedName = normalizeText(name);
            if (normalizedName === "GEMI ADI" || normalizedName === "SHIP NAME" || normalizedName.includes("GEMI GECMISI")) continue;

            const timestamp = parseDate(planlama);

            ships.push({
                source: "KEGM",
                bogaz: bogaz,
                yon: yon,
                hareket: hareket,
                planlama,
                name,
                len,
                length: parseLength(len),
                type,
                pilotReq,
                pilotRequired: normalizeText(pilotReq) === "EVET",
                tug,
                tugRequired: normalizeText(tug) === "EVET",
                sp2,
                sp1,
                time: timestamp ? new Date(timestamp).toISOString() : "",
                timestamp,
                scrapedAt: new Date().toISOString()
            });
        }
    }
    return ships;
}

function deduplicateShips(ships) {
    const map = new Map();
    for (const ship of ships) {
        const key = [
            normalizeText(ship.bogaz),
            normalizeText(ship.yon),
            normalizeText(ship.hareket),
            normalizeText(ship.name),
            ship.planlama,
            ship.sp1,
            ship.sp2
        ].join("|");
        if (!map.has(key)) map.set(key, ship);
    }
    return Array.from(map.values());
}

function loadHistory() {
    if (!fs.existsSync("history.json")) return [];
    try {
        const data = JSON.parse(fs.readFileSync("history.json", "utf8"));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

function updateHistory(history, ships) {
    const map = new Map();
    for (const item of history) {
        const key = [item.bogaz, item.yon, item.hareket, item.name, item.planlama, item.sp1, item.sp2].join("|");
        map.set(key, item);
    }

    for (const ship of ships) {
        if (!ship.pilotRequired) continue;
        const key = [ship.bogaz, ship.yon, ship.hareket, ship.name, ship.planlama, ship.sp1, ship.sp2].join("|");
        if (!map.has(key)) map.set(key, ship);
    }

    const oneYearAgo = Date.now() - CONFIG.historyDays * 24 * 60 * 60 * 1000;
    return Array.from(map.values()).filter(item => !item.timestamp || item.timestamp > oneYearAgo);
}

async function queryKEGM(page, bogaz, yon, hareket) {
    console.log(`SORGULANIYOR → ${bogaz.name} | ${yon.name} | ${hareket.name}`);

    await selectFilter(page, 0, bogaz.aliases, "Boğaz");
    await selectFilter(page, 1, yon.aliases, "Yön");
    await selectFilter(page, 2, hareket.aliases, "Hareket");

    const button = page.getByRole("button", { name: /sorgula/i }).first();
    if (await button.count() === 0) throw new Error("KEGM Sorgula butonu bulunamadı.");

    await button.click();
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(CONFIG.afterQueryWait);

    const ships = await readShipsFromTable(page, bogaz.name, yon.name, hareket.name);
    console.log(`SONUÇ → ${ships.length} gemi`);
    return ships;
}

async function queryWithRetry(page, bogaz, yon, hareket) {
    let lastError;
    for (let attempt = 1; attempt <= CONFIG.retryCount + 1; attempt++) {
        try {
            return await queryKEGM(page, bogaz, yon, hareket);
        } catch (error) {
            lastError = error;
            console.error(`Deneme ${attempt} başarısız: ${error.message}`);
            if (attempt <= CONFIG.retryCount) {
                await page.waitForTimeout(1500 * attempt);
                await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: CONFIG.navigationTimeout });
                await page.waitForTimeout(1500);
            }
        }
    }
    throw lastError;
}

async function scrape() {
    console.log("KEGM Güncel Gemi Trafik Scraper Başlatılıyor...");
    const browser = await chromium.launch({ headless: CONFIG.headless });
    const context = await browser.newContext({
        locale: "tr-TR",
        timezoneId: "Europe/Istanbul",
        viewport: { width: 1440, height: 1000 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
    });

    const page = await context.newPage();
    page.setDefaultTimeout(CONFIG.actionTimeout);
    page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);

    const allShips = [];

    try {
        await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: CONFIG.navigationTimeout });
        await page.waitForTimeout(2000);

        for (const bogaz of BOGAZLAR) {
            for (const yon of YONLER) {
                for (const hareket of HAREKETLER) {
                    const result = await queryWithRetry(page, bogaz, yon, hareket);
                    allShips.push(...result);
                }
            }
        }

        const uniqueShips = deduplicateShips(allShips);
        fs.writeFileSync("ships.json", JSON.stringify(uniqueShips, null, 2), "utf8");

        const oldHistory = loadHistory();
        const newHistory = updateHistory(oldHistory, uniqueShips);
        fs.writeFileSync("history.json", JSON.stringify(newHistory, null, 2), "utf8");

        console.log(`Bitti! Aktif Gemi: ${uniqueShips.length}, Toplam Kılavuzlu Arşiv: ${newHistory.length}`);
    } catch (error) {
        console.error("Scraper Hatası:", error.stack || error.message);
    } finally {
        await browser.close();
    }
}

scrape();
