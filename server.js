const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

async function handleShipRequest(req, res) {
    try {
        const { bogaz = 'CANAKKALE', yon = 'GÜNEY-KUZEY', hareket = 'PLAN. GEÇİŞ' } = req.query;
        console.log(`[GELEN İSTEK] Boğaz: ${bogaz} | Yön: ${yon} | Hareket: ${hareket}`);

        // KEGM Gerçek Gemi Trafik Bilgi Sistemi Sayfası
        const targetUrl = 'https://www.kiyiemniyeti.gov.tr/gemi_trafik_bilgi_sistemleri';

        // 418 Bot Engelini Aşan Gerçek Tarayıcı Başlıkları
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://www.kiyiemniyeti.gov.tr/',
                'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 25000
        });

        const $ = cheerio.load(response.data);
        let ships = [];

        // Tablodaki tüm satırları yakala
        $('table tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 6) {
                const col0 = $(cols[0]).text().trim();
                const col1 = $(cols[1]).text().trim();
                const col2 = $(cols[2]).text().trim();
                const col3 = $(cols[3]).text().trim();
                const col4 = $(cols[4]).text().trim();
                const col5 = $(cols[5]).text().trim();

                // Başlık satırını atla
                if (col0 && !col0.toLowerCase().includes('gemi') && !col0.toLowerCase().includes('adı')) {
                    ships.push({
                        shipName: col0,
                        planTime: col1,
                        length: col2,
                        shipType: col3,
                        pilot: col4,
                        tug: col5
                    });
                }
            }
        });

        // Eğer kriterlere göre filtreleme gerekirse
        const filteredShips = ships.filter(s => {
            // Boğaz veya yön metin eşleşmesi
            return true; // İlk aşamada tüm güncel liste gelsin
        });

        console.log(`[BAŞARILI] Toplam bulunan gemi sayısı: ${ships.length}`);

        res.json({
            success: true,
            count: ships.length,
            data: ships
        });

    } catch (error) {
        console.error('[HATA]:', error.message);
        res.status(500).json({
            success: false,
            message: 'KEGM verisi alınamadı: ' + error.message,
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
