const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Gerçek masaüstü Chrome tarayıcı başlıkları
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

async function handleShipRequest(req, res) {
    try {
        const { bogaz = 'CANAKKALE', yon = 'GÜNEY-KUZEY', hareket = 'PLAN. GEÇİŞ' } = req.query;
        console.log(`[GELEN İSTEK] Boğaz: ${bogaz} | Yön: ${yon} | Hareket: ${hareket}`);

        // 1. Adım: KEGM ana sayfasına gidip geçerli çerez (cookie) alıyoruz
        const session = axios.create({
            timeout: 25000,
            headers: BROWSER_HEADERS
        });

        const initRes = await session.get('https://www.kiyiemniyeti.gov.tr/');
        const cookies = initRes.headers['set-cookie'];

        let cookieHeader = '';
        if (cookies) {
            cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
        }

        // 2. Adım: Çerezle birlikte gemi listesi sayfasını çekiyoruz
        const targetUrl = 'https://www.kiyiemniyeti.gov.tr/gemi_trafigi';
        const response = await session.get(targetUrl, {
            headers: {
                ...BROWSER_HEADERS,
                'Referer': 'https://www.kiyiemniyeti.gov.tr/',
                'Cookie': cookieHeader
            }
        });

        const $ = cheerio.load(response.data);
        const ships = [];

        // Tablo satırlarını ayrıştır
        $('table tr').each((_, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 6) {
                const sName = $(cols[0]).text().trim();
                const pTime = $(cols[1]).text().trim();
                const sLen  = $(cols[2]).text().trim();
                const sType = $(cols[3]).text().trim();
                const sPlt  = $(cols[4]).text().trim();
                const sTug  = $(cols[5]).text().trim();

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

        console.log(`[BAŞARILI] Bulunan gemi: ${ships.length}`);

        return res.json({
            success: true,
            count: ships.length,
            data: ships
        });

    } catch (error) {
        console.error('[HATA]:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Veri çekilemedi: ' + error.message,
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
