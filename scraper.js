const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

async function scrape() {
  const bogazlar = ["CANAKKALE", "ISTANBUL"];
  const yonler = ["GÜNEY-KUZEY", "KUZEY-GÜNEY"];
  const hareketler = ["PLAN. GEÇİŞ", "GEÇİŞE HAZIR", "BOĞAZDA"];

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
      // Ekran görüntünüzdeki resmi "Gemi Trafik Bilgi Sistemleri" adresi
      const url = `https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems?bogaz=${encodeURIComponent(cfg.bogaz)}&yon=${encodeURIComponent(cfg.yon)}&hareket=${encodeURIComponent(cfg.hareket)}`;

      const res = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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
        // Ekran görüntünüzdeki sütun dizilimi:
        // [0]: İşlemler, [1]: Planlama/Durum, [2]: Gemi Adı, [3]: Boy, [4]: Tip, [5]: Kılavuz, [6]: Römorkör, [7]: Zaman/Tarih
        if (cols.length >= 4) {
          // Gemi adı 2. indiste (3. sütun) veya 0. indiste olabilir (emniyet kontrolü)
          let name = $(cols[2]).text().trim();
          let planState = $(cols[1]).text().trim();
          let length = $(cols[3]).text().trim();
          let type = cols.length >= 5 ? $(cols[4]).text().trim() : "-";
          let pilotReq = cols.length >= 6 ? $(cols[5]).text().trim() : "Hayır";
          let tug = cols.length >= 7 ? $(cols[6]).text().trim() : "Hayır";
          let time = cols.length >= 8 ? $(cols[7]).text().trim() : planState;

          // Eğer 2. sütunda isim yoksa (eski tabloysa) 0. sütuna bak
          if (!name || name === "İşlemler" || name.toLowerCase().includes("gemi ad")) {
            name = $(cols[0]).text().trim();
          }

          if (name && !name.toLowerCase().includes("işlem") && !name.toLowerCase().includes("gemi ad") && !name.toLowerCase().includes("planlama")) {
            allShips.push({
              bogaz: cfg.bogaz,
              yon: cfg.yon,
              hareket: cfg.hareket,
              name: name,
              time: time || cfg.hareket,
              len: length || "-",
              type: type || "-",
              pilotReq: pilotReq || "Hayır",
              tug: tug || "Hayır"
            });
            count++;
          }
        }
      });

      console.log(`Tamamlandı: ${cfg.bogaz} | ${cfg.yon} | ${cfg.hareket} -> ${count} gemi`);
    } catch (e) {
      console.log(`Hata (${cfg.bogaz} | ${cfg.yon} | ${cfg.hareket}):`, e.message);
    }
  }

  fs.writeFileSync("ships.json", JSON.stringify(allShips, null, 2));
  console.log("Kayıt tamam! Toplam çekilen gemi:", allShips.length);
}

scrape();
