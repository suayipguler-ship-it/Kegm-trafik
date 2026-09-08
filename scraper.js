const https = require("https");
const fs = require("fs");

function fetchHTML(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function scrape() {
  // KEGM resmi parametre kodları ve karşılık gelen etiketler
  const straits = [
    { code: "C", name: "CANAKKALE" },
    { code: "I", name: "ISTANBUL" }
  ];

  const directions = [
    { code: "SN", name: "GÜNEY-KUZEY" },
    { code: "NS", name: "KUZEY-GÜNEY" }
  ];

  const movements = [
    { code: "YP", name: "PLAN. GEÇİŞ" },
    { code: "YG", name: "GEÇİŞE HAZIR" },
    { code: "I",  name: "BOĞAZDA" }
  ];

  let allShips = [];

  for (const st of straits) {
    for (const dir of directions) {
      for (const mov of movements) {
        // KEGM'in beklediği birebir resmi sorgu URL'i
        const url = `https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems?Strait=${st.code}&Direction=${dir.code}&Movement=${mov.code}`;
        const html = await fetchHTML(url);

        if (!html) continue;

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

          // Resmi ekran: [0] İşlemler | [1] Planlama/Zaman | [2] Gemi Adı | [3] Boy | [4] Tip | [5] Kılavuz | [6] Römorkör
          if (cols.length >= 4) {
            let shipName = cols[2];
            
            // Başlık veya boşluk kontrolleri
            if (!shipName || shipName === "İşlemler" || shipName.toLowerCase().includes("gemi ad")) {
              shipName = cols[0];
            }

            if (shipName && !shipName.toLowerCase().includes("işlem") && !shipName.toLowerCase().includes("gemi ad") && !shipName.toLowerCase().includes("planlama")) {
              allShips.push({
                bogaz: st.name,
                yon: dir.name,
                hareket: mov.name,
                name: shipName,
                time: cols[1] || mov.name,
                len: cols[3] || "-",
                type: cols.length >= 5 ? cols[4] : "-",
                pilotReq: cols.length >= 6 ? cols[5] : "Hayır",
                tug: cols.length >= 7 ? cols[6] : "Hayır"
              });
              count++;
            }
          }
        }
        console.log(`Tamamlandı: ${st.name} | ${dir.name} | ${mov.name} -> ${count} gemi`);
      }
    }
  }

  fs.writeFileSync("ships.json", JSON.stringify(allShips, null, 2));
  console.log("Kayıt tamam! ships.json dosyasına yazılan toplam gemi:", allShips.length);
}

scrape();
