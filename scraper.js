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
      console.log("Hata:", err.message);
      resolve("");
    });
  });
}

async function scrape() {
  const html = await fetchHTML("https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems");
  
  // 1. Form etiketini ve methodunu yakala
  const formMatch = html.match(/<form[\s\S]*?action=["']?([^"'>]*)["']?[\s\S]*?>/i);
  if (formMatch) {
    console.log("FORM BULUNDU -> Action:", formMatch[1] || "(kendi adresine)");
  } else {
    console.log("Form etiketi bulunamadı.");
  }

  // 2. Sayfadaki AJAX veya API çağrısı yapan scriptleri yakala
  const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  console.log("Bulunan Script Sayısı:", scripts.length);

  for (const sc of scripts) {
    if (sc.includes("ajax") || sc.includes("fetch") || sc.includes("vessel") || sc.includes("DataTable") || sc.includes("post")) {
      console.log("--- KRİTİK SCRİPT BULUNDU ---");
      // İlgili scriptin ilk 300 karakterini dök
      console.log(sc.replace(/\s+/g, " ").slice(0, 400));
    }
  }

  if (!fs.existsSync("ships.json")) {
    fs.writeFileSync("ships.json", JSON.stringify([], null, 2));
  }
}

scrape();
