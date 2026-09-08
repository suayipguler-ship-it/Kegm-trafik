const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

async function scrape() {
  const configs = [
    { bogaz: "CANAKKALE", yon: "GÜNEY-KUZEY", hareket: "PLAN. GEÇİŞ" },
    { bogaz: "CANAKKALE", yon: "KUZEY-GÜNEY", hareket: "PLAN. GEÇİŞ" },
    { bogaz: "ISTANBUL", yon: "GÜNEY-KUZEY", hareket: "PLAN. GEÇİŞ" },
    { bogaz: "ISTANBUL", yon: "KUZEY-GÜNEY", hareket: "PLAN. GEÇİŞ" }
  ];

  let allShips = [];

  for (const cfg of configs) {
    try {
      const res = await axios.get("https://www.kiyiemniyeti.gov.tr/gemi_trafigi", {
        params: cfg,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "tr-TR,tr;q=0.9"
        },
        timeout: 15000
      });

      const $ = cheerio.load(res.data);
      const rows = $("table tbody tr").length > 0 ? $("table tbody tr") : $("table tr");

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
          }
        }
      });
    } catch (e) {
      console.log(`Hata (${cfg.bogaz} - ${cfg.yon}):`, e.message);
    }
  }

  fs.writeFileSync("ships.json", JSON.stringify(allShips, null, 2));
  console.log("İşlem tamam. Toplam çekilen gemi:", allShips.length);
}

scrape();
