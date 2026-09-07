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

        // KEGM Resmi Boğaz Trafik Sayfası
        const targetUrl = 'https://www.kiyiemniyeti.gov.tr/bogaz_trafigi';
        
        const response = await axios.get(targetUrl, {
            params: {
                bogaz: bogaz,
                yon: yon,
                hareket: hareket
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 25000
        });

        const $ = cheerio.load(response.data);
        const ships = [];

        // Tablodaki tüm satırları tara
        $('table tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 6) {
                const shipName = $(cols[0]).text().trim();
                const planTime = $(cols[1]).text().trim();
                const length = $(cols[2]).text().trim();
                const shipType = $(cols[3]).text().trim();
                const pilot = $(cols[4]).text().trim();
                const tug = $(cols[5]).text().trim();

                if (shipName && !shipName.toLowerCase().includes('gemi')) {
                    ships.push({
                        shipName,
                        planTime,
                        length,
                        shipType,
                        pilot,
                        tug
                    });
                }
            }
        });

        console.log(`[SONUÇ] Bulunan gemi sayısı: ${ships.length}`);

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
