const https = require("https");
const fs = require("fs");

function requestKEGM(url, method = "GET", postData = null) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9"
      }
    };

    if (method === "POST" && postData) {
      options.headers["Content-Type"] = "application/x-www-form-urlencoded";
      options.headers["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });

    req.on("error", (err) => {
      console.log("Bağlantı Hatası:", err.message);
      resolve({ status: 500, data: "" });
    });

    if (method === "POST" && postData) {
      req.write(postData);
    }
    req.end();
  });
}

function cleanText(text) {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function scrape() {
  console.log("KEGM Trafik Sorgulama Başlıyor...");
  
  // Önce ana sayfayı çekip form yapısını ve select value değerlerini görelim
  const mainPage = await requestKEGM("https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems");
  console.log("Ana sayfa yanıt kodu:", mainPage.status, "HTML Boyutu:", mainPage.data.length);

  // Sayfadaki select option'ları konsola yazdıralım ki doğru value'ları görelim
  const selectRegex = /<select[^>]*name=["']?([^"'>]+)["']?[^>]*>([\s\S]*?)<\/select>/gi;
  let selectMatch;
  while ((selectMatch = selectRegex.exec(mainPage.data)) !== null) {
    console.log(`Select Bulundu: name="${selectMatch[1]}"`);
    const optRegex = /<option[^>]*value=["']?([^"'>]*)["']?[^>]*>([\s\S]*?)<\/option>/gi;
    let optMatch;
    while ((optMatch = optRegex.exec(selectMatch[2])) !== null) {
      console.log(`   Option -> value: "${optMatch[1]}", label: "${cleanText(optMatch[2])}"`);
    }
  }

  const bogazlar = ["CANAKKALE", "ISTANBUL"];
  const yonler = ["GÜNEY-KUZEY", "KUZEY-GÜNEY"];
  const hareketler = ["PLAN. GEÇİŞ", "GEÇİŞE HAZIR", "BOĞAZDA"];

  let allShips = [];

  for (const bogaz of bogazlar) {
    for (const yon of yonler) {
      for (const hareket of hareketler) {
        // Hem URL parametresi hem de sayfa içi tablo tarama
        const url = `https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems?bogaz=${encodeURIComponent(bogaz)}&yon=${encodeURIComponent(yon)}&hareket=${encodeURIComponent(hareket)}`;
        const res = await requestKEGM(url);

        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch;
        let count = 0;

        while ((trMatch = trRegex.exec(res.data)) !== null) {
          const rowContent = trMatch[1];
          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let tdMatch;
          let cols = [];

          while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
            cols.push(cleanText(tdMatch[1]));
          }

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
        if (count > 0) {
          console.log(`BULUNDU: ${bogaz} | ${yon} | ${hareket} -> ${count} gemi`);
        }
      }
    }
  }

  console.log("Toplam ayıklanan gemi:", allShips.length);
  fs.writeFileSync("ships.json", JSON.stringify(allShips, null, 2));
}

scrape();
