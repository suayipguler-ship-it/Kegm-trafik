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
        console.log(`[GELEN SORGULAMA] Boğaz: ${bogaz} | Yön: ${yon} | Hareket: ${hareket}`);

        // KEGM form parametrelerini eşleştir
        const cleanYon = yon.includes('GÜNEY') || yon.includes('GUNEY') ? 'GÜNEY-KUZEY' : 'KUZEY-GÜNEY';
        const cleanHareket = hareket.includes('PLAN') ? 'PLAN. GEÇİŞ' : hareket;

        const targetUrl = 'https://www.kiyiemniyeti.gov.tr/gemi_trafigi';

        // 1. Önce sayfaya bağlanıp çerez (cookie) alıyoruz
        const session = axios.create({
            timeout: 25000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
                'Origin': 'https://www.kiyiemniyeti.gov.tr',
                'Referer': 'https://www.kiyiemniyeti.gov.tr/gemi_trafigi'
            }
        });

        const initRes = await session.get(targetUrl);
        const cookies = initRes.headers['set-cookie'];
        const cookieHeader = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

        // 2. Form verisiyle POST isteği gönderiyoruz
        const params = new URLSearchParams();
        params.append('bogaz', bogaz);
        params.append('yon', cleanYon);
        params.append('hareket', cleanHareket);

        const postRes = await session.post(targetUrl, params.toString(), {
            headers: {
                'Cookie': cookieHeader,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const $ = cheerio.load(postRes.data);
        const ships = [];

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
                        pilot: sPlt.length > 0 ? sPlt : 'Hayır',
                        tug: sTug.length > 0 ? sTug : 'Hayır'
                    });
                }
            }
        });

        console.log(`[DÖNEN GEMİ SAYISI]: ${ships.length}`);

        return res.json({
            success: true,
            count: ships.length,
            data: ships
        });

    } catch (error) {
        console.error('[HATA]:', error.message);
        return res.json({
            success: false,
            message: error.message,
            data: []
        });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda devrede.`);
});
