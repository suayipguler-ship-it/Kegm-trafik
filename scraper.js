const https = require("https");
const fs = require("fs");

function fetchHTML(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "tr-TR,tr;q=0.9"
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
    }).on("error", (err) => {
      console.log("Bağlantı hatası:", err.message);
      resolve("");
    });
  });
}

function cleanText(text) {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function scrape() {
  const bogazlar = ["CANAKKALE", "ISTANBUL"];
  const yonler = ["GÜNEY-KUZEY", "KUZEY-GÜNEY"];
  const hareketler = ["PLAN. GEÇİŞ", "GEÇİŞE HAZIR", "BOĞAZDA"];

  let allShips = [];

  for (const bogaz of bogazlar) {
    for (const yon of yonler) {
      for (const hareket of hareketler) {
        const url = `https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems?bogaz=${encodeURIComponent(bogaz)}&yon=${encodeURIComponent(yon)}&hareket=${encodeURIComponent(hareket)}`;
        const html = await fetchHTML(url);

        if (!html) continue;

        // Tablo satırlarını ayıkla
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch;
        let count = 0;

        while ((trMatch = trRegex.exec(html)) !== null) {
          const rowContent = trMatch[1];
          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let tdMatch;
          let cols = [];

          while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
            cols.push(cleanText(tdMatch[1]));
          }

          // Resmi ekran: [0] İşlemler, [1] Planlama, [2] Gemi Adı, [3] Boy, [4] Tip, [5] Kılavuz, [6] Römorkör
          if (cols.length >= 4) {
            let name = cols[2];
            if (!name || name === "İşlemler" || name.includes("Gemi Ad")) {
              name = cols[0];
            }

            if (name && !name.includes("İşlemler") && !name.includes("Gemi Ad") && !name.includes("Planlama")) {
              allShips.push({
                bogaz: bogaz,
                yon: yon,
                hareket: hareket,
                name: name,
                time: cols[1] || hareket,
                len: cols[3] || "-",
                type: cols.length >= 5 ? cols[4] : "-",
                pilotReq: cols.length >= 6 ? cols[5] : "Hayır",
                tug: cols.length >= 7 ? cols[6] : "Hayır"
              });
              count++;
            }
          }
        }
        console.log(`Tamamlandı: ${bogaz} | ${yon} | ${hareket} -> ${count} gemi`);
      }
    }
  }

  fs.writeFileSync("ships.json", JSON.stringify(allShips, null, 2));
  console.log("ships.json başarıyla oluşturuldu. Toplam gemi:", allShips.length);
}

scrape();
