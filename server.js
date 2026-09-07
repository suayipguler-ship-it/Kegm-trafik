const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/ships', async (req, res) => {
    try {
        const { bogaz = 'CANAKKALE', yon = 'GÜNEY-KUZEY', hareket = 'PLAN. GEÇİŞ' } = req.query;

        const response = await axios.get('https://www.kiyiemniyeti.gov.tr/gemi_trafigi', {
            params: {
                bogaz: bogaz,
                yon: yon,
                hareket: hareket
            },
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        const $ = cheerio.load(response.data);
        const ships = [];

        $('table tbody tr').each((_, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 5) {
                const sName = $(cols[0]).text().trim();
                const pTime = $(cols[1]).text().trim();
                const sLen  = $(cols[2]).text().trim();
                const sType = $(cols[3]).text().trim();
                const sPlt  = cols.length >= 6 ? $(cols[4]).text().trim() : '';
                const sTug  = cols.length >= 6 ? $(cols[5]).text().trim() : $(cols[4]).text().trim();

                if (sName && !sName.toLowerCase().includes('gemi')) {
                    ships.push({
                        shipName: sName,
                        planTime: pTime,
                        length: sLen,
                        shipType: sType,
                        pilot: sPlt || 'Hayır',
                        tug: sTug || 'Hayır'
                    });
                }
            }
        });

        return res.json(ships);

    } catch (error) {
        return res.json([]);
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Sunucu aktif.`);
});
