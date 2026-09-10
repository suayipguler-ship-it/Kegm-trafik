const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BOGAZLAR = [
    { name: 'CANAKKALE', code: 'C' },
    { name: 'ISTANBUL', code: 'I' }
];

const YONLER = [
    { name: 'GÜNEY-KUZEY', code: 'SN' },
    { name: 'KUZEY-GÜNEY', code: 'NS' }
];

const HAREKETLER = [
    { name: 'PLAN. GEÇİŞ', code: 'YP' },
    { name: 'GEÇİŞE HAZIR', code: 'YG' },
    { name: 'BOĞAZDA', code: 'I' }
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
    console.log('KEGM Trafik POST Oturumu Başlatılıyor...');
    const liveShips = [];

    let history = [];
    if (fs.existsSync('history.json')) {
        try {
            history = JSON.parse(fs.readFileSync('history.json', 'utf8'));
            if (!Array.isArray(history)) history = [];
        } catch (e) {
            history = [];
        }
    }

    const currentTimestamp = Date.now();
    const oneYearAgo = currentTimestamp - (365 * 24 * 60 * 60 * 1000);

    const targetUrl = 'https://kiyiemniyeti.gov.tr/gemi_trafi%C4%9Fi';

    // 1. ADIM: İlk GET ile Çerez ve Form State Değerlerini Al
    let cookies = '';
    let formAction = targetUrl;
    let viewState = '';
    let viewStateGen = '';
    let eventValidation = '';
    let reqToken = '';

    try {
        const initRes = await axios.get(targetUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        if (initRes.headers['set-cookie']) {
            cookies = initRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        }

        const $init = cheerio.load(initRes.data);
        viewState = $init('input[name="__VIEWSTATE"]').val() || '';
        viewStateGen = $init('input[name="__VIEWSTATEGENERATOR"]').val() || '';
        eventValidation = $init('input[name="__EVENTVALIDATION"]').val() || '';
        reqToken = $init('input[name="__RequestVerificationToken"]').val() || '';

        const formElem = $init('form, FORM');
        if (formElem.attr('action')) {
            const act = formElem.attr('action');
            formAction = act.startsWith('http') ? act : `https://kiyiemniyeti.gov.tr${act.startsWith('/') ? '' : '/'}${act}`;
        }
        console.log('Oturum hazırlandı.');
    } catch (e) {
        console.error('İlk bağlantı hatası:', e.message);
    }

    // 2. ADIM: Her Parametre İçin HTTP POST İsteği Gönder
    for (const b of BOGAZLAR) {
        for (const y of YONLER) {
            for (const h of HAREKETLER) {
                try {
                    const postData = new URLSearchParams();
                    if (viewState) postData.append('__VIEWSTATE', viewState);
                    if (viewStateGen) postData.append('__VIEWSTATEGENERATOR', viewStateGen);
                    if (eventValidation) postData.append('__EVENTVALIDATION', eventValidation);
                    if (reqToken) postData.append('__RequestVerificationToken', reqToken);

                    // Resmi Form Alanları
                    postData.append('Strait', b.code);
                    postData.append('Direction', y.code);
                    postData.append('Movement', h.code);

                    const res = await axios.post(formAction, postData.toString(), {
                        timeout: 12000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Referer': targetUrl,
                            'Cookie': cookies
                        }
                    });

                    const $ = cheerio.load(res.data);
                    let rowCount = 0;

                    $('table tbody tr, table tr').each((_, elem) => {
                        const cols = $(elem).find('td');
                        if (cols.length >= 6) {
                            const name = cleanText($(cols[0]).text());
                            const len = cleanText($(cols[1]).text());
                            const type = cleanText($(cols[2]).text());
                            const pilotReq = cleanText($(cols[3]).text());
                            const tug = cleanText($(cols[4]).text());
                            const time = cleanText($(cols[5]).text());
                            const imo = cols.length >= 7 ? cleanText($(cols[6]).text()) : '';

                            if (name && !name.toLowerCase().includes('gemi') && time) {
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
                                    entryTimestamp: parseCustomDate(time) || currentTimestamp
                                };

                                liveShips.push(shipObj);
                                rowCount++;

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

    // 1 YILLIK LOG KORUMA
    history = history.filter(h => (h.entryTimestamp || 0) > oneYearAgo);

    fs.writeFileSync('ships.json', JSON.stringify(liveShips, null, 2), 'utf8');
    fs.writeFileSync('history.json', JSON.stringify(history, null, 2), 'utf8');

    console.log(`Bitti! Aktif Gemi: ${liveShips.length}, Toplam Arşiv: ${history.length}`);
}

scrape();
