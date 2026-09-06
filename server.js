const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Gemi Trafik Verisi Çekme API
app.get('/api/ships', async (req, res) => {
    try {
        const { bogaz = 'CANAKKALE', yon = 'GÜNEY-KUZEY', hareket = 'BOĞAZDA' } = req.query;

        // KEGM Boğaz Trafik Sayfası
        const targetUrl = 'https://www.kiyiemniyeti.gov.tr/gemi_trafigi';
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const ships = [];

        // Tablo satırlarını parse etme
        $('table tbody tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 6) {
                const shipName = $(cols[0]).text().trim();
                const planTime = $(cols[1]).text().trim();
                const length = $(cols[2]).text().trim();
                const shipType = $(cols[3]).text().trim();
                const pilot = $(cols[4]).text().trim();
                const tug = $(cols[5]).text().trim();

                if (shipName) {
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

        res.json({ success: true, count: ships.length, data: ships });
    } catch (error) {
        console.error('Veri çekme hatası:', error.message);
        res.status(500).json({ success: false, message: 'Veri çekilemedi: ' + error.message });
    }
});

// Ana sayfa yönlendirmesi
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});
