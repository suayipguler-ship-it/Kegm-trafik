const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BOGAZLAR = [
    { name: 'CANAKKALE', val: '2' },
    { name: 'ISTANBUL', val: '1' }
];

const YONLER = [
    { name: 'GÜNEY-KUZEY', val: '1' },
    { name: 'KUZEY-GÜNEY', val: '2' }
];

const HAREKETLER = [
    { name: 'PLAN. GEÇİŞ', val: '1' },
    { name: 'GEÇİŞE HAZIR', val: '2' },
    { name: 'BOĞAZDA', val: '3' }
];

function cleanText(str) {
    if (!str) return '';
    return str.replace(/\s+/g, ' ').trim();
}

function parseCustomDate(str) {
    if (!str) return 0;
    const match = str.match(/(\d{2})[./](\d{2})[./](\d{2,4})\s+(\d{2}):(\d{2})/);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        let year = parseInt(match[3], 10);
        if (year < 100) year += 2000;
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);
        return new Date(year, month, day, hour, minute).getTime();
    }
    const timeMatch = str.match(/(\d{2}):(\d{2})/);
    if (timeMatch) {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10)).getTime();
    }
    return 0;
}

async function scrape() {
    console.log('KEGM Trafik Verileri Çekiliyor...');
    const liveShips = [];

    // Mevcut history.json dosyasını yükle
    let history = [];
    if (fs.existsSync('history.json')) {
        try {
            history = JSON.parse(fs.readFileSync('history.json', 'utf8'));
            if (!Array.isArray(history)) history = [];
        } catch (e) {
            history = [];
        }
    }

    const now = Date.now();

    for (const b of BOGAZLAR) {
        for (const y of YONLER) {
            for (const h of HAREKETLER) {
                try {
                    const url = `https://kiyiemniyeti.gov.tr/gemi_trafiği?b=${b.val}&y=${y.val}&h=${h.val}`;
                    const res = await axios.get(url, {
                        timeout: 12000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });

                    const $ = cheerio.load(res.data);
                    let rowCount = 0;

                    $('table tbody tr').each((_, elem) => {
                        const cols = $(elem).find('td');
                        if (cols.length >= 7) {
                            const name = cleanText($(cols[0]).text());
                            const len = cleanText($(cols[1]).text());
                            const type = cleanText($(cols[2]).text());
                            const pilotReq = cleanText($(cols[3]).text());
                            const tug = cleanText($(cols[4]).text());
                            const time = cleanText($(cols[5]).text());
                            const imo = cleanText($(cols[6]).text());

                            if (name && name !== 'Gemi Adı') {
                                const shipObj = {
                                    bogaz: b.name,
                                    yon: y.name,
                                    hareket: h.name,
                                    name,
                                    len,
                                    type,
                                    pilotReq,
                                    tug,
                                    time,
                                    imo,
                                    entryTimestamp: parseCustomDate(time) || now
                                };

                                liveShips.push(shipObj);
                                rowCount++;

                                // Log Arşivi: Yalnızca kılavuzlu gemiler ('E' veya 'KILAVUZLU')
                                const isPiloted = pilotReq.toUpperCase().includes('E') || pilotReq.toUpperCase().includes('KILAVUZ');
                                if (isPiloted) {
                                    const exists = history.some(item => 
                                        item.name === shipObj.name && 
                                        item.time === shipObj.time && 
                                        item.bogaz === shipObj.bogaz
                                    );
                                    if (!exists) {
                                        history.push(shipObj);
                                    }
                                }
                            }
                        }
                    });

                    console.log(`Sonuç: ${b.name} | ${y.name} | ${h.name} -> ${rowCount} gemi`);
                } catch (err) {
                    console.error(`Hata (${b.name} - ${y.name} - ${h.name}): ${err.message}`);
                }
            }
        }
    }

    // 1 YILLIK LOG KORUMA (365 GÜN)
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    history = history.filter(h => (h.entryTimestamp || 0) > oneYearAgo);

    // Dosyaları Kaydet
    fs.writeFileSync('ships.json', JSON.stringify(liveShips, null, 2), 'utf8');
    fs.writeFileSync('history.json', JSON.stringify(history, null, 2), 'utf8');

    console.log(`Tamamlandı. Aktif: ${liveShips.length} | Arşiv: ${history.length} gemi.`);
}

scrape();
