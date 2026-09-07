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
        console.log(`[İSTEK] Boğaz: ${bogaz} | Yön: ${yon} | Hareket: ${hareket}`);

        // KEGM Hedef Sayfası
        const targetUrl = 'https://www.kiyiemniyeti.gov.tr/gemi_trafigi';
        
        // 418 IP Blokajını aşmak için aracı proxy tüneli
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

        console.log('[TÜNEL] Proxy üzerinden KEGM verisi isteniyor...');

        const response = await axios.get(proxyUrl, {
            timeout: 25000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const ships = [];

        // Tablo satırlarını ayrıştır
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

        console.log(`[BAŞARILI] 418 aşıldı! Çekilen gemi sayısı: ${ships.length}`);

        res.json({
            success: true,
            count: ships.length,
            data: ships
        });

    } catch (error) {
        console.error('[HATA]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Veri tünelden alınamadı: ' + error.message,
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
