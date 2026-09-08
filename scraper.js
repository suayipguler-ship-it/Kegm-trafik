const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

async function scrape() {
  const bogazlar = ["CANAKKALE", "ISTANBUL"];
  const yonler = ["GÜNEY-KUZEY", "KUZEY-GÜNEY"];
  const hareketler = ["PLAN. GEÇİŞ", "GEÇİŞE HAZIR", "BOĞAZDA"];

  // 2 Boğaz x 2 Yön x 3 Hareket = 12 kombinasyonun tamamı
  let configs = [];
  for (const bogaz of bogazlar) {
    for (const yon of yonler) {
      for (const hareket of hareketler) {
        configs.push({ bogaz, yon, hareket });
      }
    }
  }

  let allShips = [];

  for (const cfg of configs) {
    try {
      const url = `https://www.kiyiemniyeti.gov.tr/gemi_trafigi?bogaz=${encodeURIComponent(cfg.bogaz)}&yon=${encodeURIComponent(cfg.yon)}&hareket=${encodeURIComponent(cfg.hareket)}`;

      const res = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.9"
        },
        timeout: 20000
      });

      const $ = cheerio.load(res.data);
      const rows = $("table tbody tr").length > 0 ? $("table tbody tr") : $("table tr");

      let count = 0;
      rows.each((_, row) => {
        const cols = $(row).find("td");
        if (cols.length >= 5) {
          const name = $(cols[0]).text().trim();
          if (name && !name.toLowerCase().includes("gemi") && !name.toLowerCase().includes("adı")) {
            allShips.push({
              bogaz: cfg.bogaz,
              yon: cfg.yon,
              hareket: cfg.hareket,
              name: name,
              time: $(cols[1]).text().trim(),
              len: $(cols[2]).text().trim(),
              type: $(cols[3]).text().trim(),
              pilotReq: cols.length >= 6 ? $(cols[4]).text().trim() : "Hayır",
              tug: cols.length >= 6 ? $(cols[5]).text().trim() : $(cols[4]).text().trim()
            });
            count++;
          }
        }
      });
      console.log(`Tamamlandı: ${cfg.bogaz} | ${cfg.yon} | ${cfg.hareket} -> ${count} gemi`);
    } catch (e) {
      console.log(`Hata (${cfg.bogaz} - ${cfg.yon} - ${cfg.hareket}):`, e.message);
    }
  }

  fs.writeFileSync("ships.json", JSON.stringify(allShips, null, 2));
  console.log("Kayıt tamam. Toplam toplanan gemi sayısı:", allShips.length);
}

scrape();
