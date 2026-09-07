const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Hem /ships hem de /api/ships çağrılarını karşılayan ortak veri fonksiyonu
async function handleShipRequest(req, res) {
    try {
        const { bogaz = 'CANAKKALE', yon = 'GÜNEY-KUZEY', hareket = 'PLAN. GEÇİŞ' } = req.query;

        console.log(`[İSTEK ALINDI] Boğaz: ${bogaz} | Yön: ${yon} | Hareket: ${hareket}`);

        // KEGM resmi Boğaz Trafik Sorgulama URL'si
        const targetUrl = 'https://www.kiyiemniyeti.gov.tr/gemi_trafigi';
        
        const response = await axios.get(targetUrl, {
            params: {
                bogaz: bogaz,
                yon: yon,
                hareket: hareket
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.kiyiemniyeti.gov.tr/'
            },
            timeout: 20000
        });

        const $ = cheerio.load(response.data);
        const ships = [];

        // Tablo satırlarını tespit et
        $('table tbody tr, table tr').each((i, el) => {
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

        console.log(`[BAŞARILI] Çekilen Gemi Sayısı: ${ships.length}`);

        // Hem dizi hem de { data: [] } bekleyen istemciler için standart yanıt
        res.json({
            success: true,
            count: ships.length,
            data: ships
        });

    } catch (error) {
        console.error('[HATA OLUŞTU]:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'KEGM sunucusuna bağlanılamadı: ' + error.message,
            data: [] 
        });
    }
}

// Android ve Web farklı endpoint çağırsa bile ikisini de yakala:
app.get('/ships', handleShipRequest);
app.get('/api/ships', handleShipRequest);

// Web Arayüzü İçin Kök Dizin
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});
