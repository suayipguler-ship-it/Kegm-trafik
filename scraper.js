const https = require("https");
const fs = require("fs");

function fetchURL(url, options = {}) {
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
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });

    req.on("error", (err) => {
      console.log("Hata:", err.message);
      resolve({ status: 500, data: "" });
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

async function scrape() {
  console.log("Sayfa inceleniyor...");
  const page = await fetchURL("https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems");
  
  console.log("Durum Kodu:", page.status);
  console.log("Sayfa Boyutu:", page.data.length);

  // Sayfa içerisindeki API veya AJAX uç noktalarını yakalayalım
  const urls = page.data.match(/(https?:\/\/[^\s"']+|\/[a-zA-Z0-9_\-\/]+(?:json|api|get|post|data|table|vessel)[^\s"']*)/gi) || [];
  console.log("Olası Veri Bağlantıları:", [...new Set(urls)].slice(0, 15));

  // Form etiketlerini ve input alanlarını yakalayalım
  const forms = page.data.match(/<form[\s\S]*?<\/form>/gi) || [];
  console.log("Bulunan Form Sayısı:", forms.length);
  if (forms.length > 0) {
    console.log("İlk Form Özeti:", forms[0].slice(0, 300));
  }

  // Boş ships.json yaz ki hata almasın
  if (!fs.existsSync("ships.json")) {
    fs.writeFileSync("ships.json", JSON.stringify([], null, 2));
  }
}

scrape();
