const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
    'Origin': 'https://www.kiyiemniyeti.gov.tr',
    'Referer': 'https://www.kiyiemniyeti.gov.tr/gemi_trafigi'
};

async function handleShipRequest(req, res) {
    try {
        let { bogaz = 'CANAKKALE', yon = 'GÜNEY-KUZEY', hareket = 'PLAN. GEÇİŞ' } = req.query;
        console.log(`[GELEN İSTEK] Boğaz: ${bogaz} | Yön: ${yon} | Hareket: ${hareket}`);

        // Parametreleri KEGM form formatına dönüştür
        const cleanYon = yon.includes('GÜNEY') && yon.startsWith('G') ? 'GUNEY-KUZEY' : 
                         yon.includes('KUZEY') && yon.startsWith('K') ? 'KUZEY-GUNEY' : yon;
        
        const cleanHareket = hareket.includes('PLAN') ? 'PLAN' : 'BOGAZDA';

        const session = axios.create({
            timeout: 25000,
            headers: BROWSER_HEADERS
        });

        // 1. Ana sayfadan oturum çerezi al
        const initRes = await session.get('https://www.kiyiemniyeti.gov.tr/gemi_trafigi');
        const rawCookies = initRes.headers['set-cookie'];
        const cookie = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';

        // 2. KEGM formuna hem GET hem POST ile sorgu at
        const formData = new URLSearchParams();
        formData.append('bogaz', bogaz);
        formData.append('yon', cleanYon);
        formData.append('hareket', cleanHareket);

        let response = await session.post('https://www.kiyiemniyeti.gov.tr/gemi_trafigi', formData.toString(), {
            headers: {
                ...BROWSER_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookie
            }
        });

        let $ = cheerio.load(response.data);
        let ships = [];

        // Tabloyu tara
        $('table tr').each((_, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 5) {
                const sName = $(cols[0]).text().trim();
                const pTime = $(cols[1]).text().trim();
                const sLen  = $(cols[2]).text().trim();
                const sType = $(cols[3]).text().trim();
                const sPlt  = cols.length >= 6 ? $(cols[4]).text().trim() : '';
                const sTug  = cols.length >= 6 ? $(cols[5]).text().trim() : $(cols[4]).text().trim();

                if (sName && !sName.toLowerCase().includes('gemi') && !sName.toLowerCase().includes('adı')) {
                    ships.push({
                        shipName: sName,
                        planTime: pTime,
                        length: sLen,
                        shipType: sType,
                        pilot: sPlt,
                        tug: sTug
                    });
                }
            }
        });

        // Eğer POST tablosu boş dönerse GET parametreli dene
        if (ships.length === 0) {
            const getRes = await session.get(`https://www.kiyiemniyeti.gov.tr/gemi_trafigi?bogaz=${bogaz}&yon=${encodeURIComponent(yon)}&hareket=${encodeURIComponent(hareket)}`, {
                headers: { ...BROWSER_HEADERS, 'Cookie': cookie }
            });
            const $get = cheerio.load(getRes.data);
            $get('table tr').each((_, el) => {
                const cols = $get(el).find('td');
                if (cols.length >= 5) {
                    const sName = $get(cols[0]).text().trim();
                    if (sName && !sName.toLowerCase().includes('gemi')) {
                        ships.push({
                            shipName: sName,
                            planTime: $get(cols[1]).text().trim(),
                            length: $get(cols[2]).text().trim(),
                            shipType: $get(cols[3]).text().trim(),
                            pilot: cols.length >= 6 ? $get(cols[4]).text().trim() : '',
                            tug: cols.length >= 6 ? $get(cols[5]).text().trim() : $get(cols[4]).text().trim()
                        });
                    }
                }
            });
        }

        console.log(`[SONUÇ] Çekilen gerçek gemi sayısı: ${ships.length}`);

        return res.json({
            success: true,
            count: ships.length,
            data: ships
        });

    } catch (error) {
        console.error('[HATA]:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Veri hatası: ' + error.message,
            data: []
        });
    }
}

app.get('/ships', handleShipRequest);
app.get('/api/ships', handleShipRequest);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});
