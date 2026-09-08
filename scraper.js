const https = require("https");
const fs = require("fs");

function makeRequest(url, options = {}) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9",
        ...(options.headers || {})
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = "";
      const cookies = res.headers["set-cookie"] || [];
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, data, cookies, headers: res.headers }));
    });

    req.on("error", (err) => {
      console.log("Hata:", err.message);
      resolve({ status: 500, data: "", cookies: [] });
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

function cleanText(text) {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function scrape() {
  console.log("KEGM Veri Çekme Başlıyor (IMO Destekli)...");

  const initial = await makeRequest("https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems");
  
  let cookieHeader = "";
  if (initial.cookies && initial.cookies.length > 0) {
    cookieHeader = initial.cookies.map(c => c.split(";")[0]).join("; ");
  }

  let token = "";
  const tokenMatch = initial.data.match(/name=["']__RequestVerificationToken["']\s+type=["']hidden["']\s+value=["']([^"']+)["']/i) ||
                     initial.data.match(/value=["']([^"']+)["']\s+name=["']__RequestVerificationToken["']/i);
  if (tokenMatch) {
    token = tokenMatch[1];
  }

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
        let params = [];
        if (token) params.push(`__RequestVerificationToken=${encodeURIComponent(token)}`);
        params.push(`Strait=${encodeURIComponent(st.code)}`);
        params.push(`Direction=${encodeURIComponent(dir.code)}`);
        params.push(`Movement=${encodeURIComponent(mov.code)}`);
        const postData = params.join("&");

        const res = await makeRequest("https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(postData),
            "Cookie": cookieHeader,
            "Origin": "https://www.kiyiemniyeti.gov.tr",
            "Referer": "https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems"
          },
          body: postData
        });

        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch;
        let count = 0;

        while ((trMatch = trRegex.exec(res.data)) !== null) {
          const rowContent = trMatch[1];

          // IMO numarasını fonksiyon çağrısından veya parametreden yakala
          let imo = "";
          const mapMatch = rowContent.match(/ShowOnMap\(\s*['"]?[0-9]{9}['"]?\s*,\s*['"]?([0-9]{7})['"]?\s*\)/i);
          if (mapMatch) {
            imo = mapMatch[1];
          } else {
            const histMatch = rowContent.match(/ShowHistory\(\s*['"]?([0-9]{7})['"]?\s*\)/i);
            if (histMatch) imo = histMatch[1];
            const imoUrlMatch = rowContent.match(/IMONumber=([0-9]{7})/i);
            if (imoUrlMatch) imo = imoUrlMatch[1];
          }

          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let tdMatch;
          let cols = [];

          while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
            cols.push(cleanText(tdMatch[1]));
          }

          if (cols.length >= 4) {
            let shipName = cols[2];
            if (!shipName || shipName === "İşlemler" || shipName.includes("Gemi Ad")) {
              shipName = cols[0];
            }

            if (shipName && !shipName.includes("İşlemler") && !shipName.includes("Gemi Ad") && !shipName.includes("Planlama")) {
              allShips.push({
                bogaz: st.name,
                yon: dir.name,
                hareket: mov.name,
                name: shipName,
                imo: imo || "",
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
        console.log(`Sonuç: ${st.name} | ${dir.name} | ${mov.name} -> ${count} gemi`);
      }
    }
  }

  fs.writeFileSync("ships.json", JSON.stringify(allShips, null, 2));
  console.log("TAMAMLANDI! ships.json toplam gemi sayısı:", allShips.length);
}

scrape();
