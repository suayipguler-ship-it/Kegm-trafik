const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Puppeteer ile Bot Filtresini Aşan Veri Çekme Fonksiyonu
async function fetchShipsWithBrowser() {
    console.log('[BAŞLIYOR] Görünmez tarayıcı açılıyor...');
    
    // Puppeteer'ı Render üzerinde çalışacak şekilde yapılandır
    const browser = await puppeteer.launch({
        headless: "new", // Arka planda çalış
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Render ücretsiz katman için bellek tasarrufu
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Gerçek tarayıcı gibi davranmak için başlıkları ayarla
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // KEGM Gerçek Veri Sayfası
        const targetUrl = 'https://www.kiyiemniyeti.gov.tr/gemi_trafik_bilgi_sistemleri';
        console.log(`[BAĞLANIYOR] ${targetUrl}`);

        // Sayfaya git ve Cloudflare/bot filtreleri için bekle
        await page.goto(targetUrl, { 
            waitUntil: 'networkidle2', // Ağ trafiği durana kadar bekle
            timeout: 50000 
        });

        // Tablonun yüklenmesini bekle
        await page.waitForSelector('table', { timeout: 20000 });
        console.log('[BULUNDU] Tablo yapısı yüklendi.');

        // Sayfa içindeki tablo verilerini Puppeteer ile çek
        const ships = await page.evaluate(() => {
            let shipList = [];
            // Tüm tablo satırlarını yakala
            const rows = document.querySelectorAll('table tr');
            
            rows.forEach((row, index) => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 6) {
                    const col0 = cols[0].innerText.trim();
                    const col1 = cols[1].innerText.trim();
                    const col2 = cols[2].innerText.trim();
                    const col3 = cols[3].innerText.trim();
                    const col4 = cols[4].innerText.trim();
                    const col5 = cols[5].innerText.trim();

                    // Başlık satırını atla
                    if (col0 && !col0.toLowerCase().includes('gemi') && !col0.toLowerCase().includes('adı')) {
                        shipList.push({
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
            return shipList;
        });

        console.log(`[BAŞARILI] Bot filtresi aşıldı. Gemi Sayısı: ${ships.length}`);
        return { success: true, ships };

    } catch (error) {
        console.error('[HATA OLUŞTU]:', error.message);
        return { success: false, message: error.message };
    } finally {
        // Tarayıcıyı mutlaka kapat
        await browser.close();
        console.log('[KAPANDI] Görünmez tarayıcı kapatıldı.');
    }
}

// API Endpointleri
async function handleShipRequest(req, res) {
    // Android/İOS'tan gelen filtreler
    const { bogaz = 'CANAKKALE', yon = 'GÜNEY-KUZEY', hareket = 'PLAN. GEÇİŞ' } = req.query;
    console.log(`[İSTEK ALINDI] Boğaz: ${bogaz} | Yön: ${yon} | Hareket: ${hareket}`);

    const result = await fetchShipsWithBrowser();

    if (result.success) {
        res.json({
            success: true,
            count: result.ships.length,
            data: result.ships // İlk aşamada tüm güncel liste gelsin
        });
    } else {
        res.status(500).json({
            success: false,
            message: 'KEGM verisi Puppeteer ile alınamadı: ' + result.message,
            data: []
        });
    }
}

app.get('/ships', handleShipRequest);
app.get('/api/ships', handleShipRequest);

// Web Arayüzü İçin Kök Dizin
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif. (Puppeteer Modu)`);
});
