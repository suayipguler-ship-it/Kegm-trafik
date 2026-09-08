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

function cleanText(text) {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function scrape() {
  console.log("Veri çekme başladı...");
  
  // Ana sayfa 1.6 MB veriyle geliyor, tüm gemileri içeriyor
  const html = await fetchHTML("https://www.kiyiemniyeti.gov.tr/vessel_traffic_information_systems");
  
  let allShips = [];

  // Tablodaki tüm satırları yakala
  const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  console.log("Toplam bulunan tr satır sayısı:", rowMatches.length);

  for (const row of rowMatches) {
    const cols = [];
    const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    for (const cell of cellMatches) {
      cols.push(cleanText(cell));
    }

    // Gemi satırlarını tespit et
    // Tipik satır: [İşlemler, PLAN. GEÇİŞ, ORUBA, 13..., ...]
    if (cols.length >= 4) {
      // Başlık satırı değilse
      const textJoined = cols.join(" ");
      if (textJoined.includes("Gemi Adı") || textJoined.includes("İşlemler") && cols.length < 5) continue;

      let name = "";
      let movement = "";
      let length = "-";
      let type = "-";
      let pilotReq = "Hayır";
      let tug = "Hayır";

      // Kolonları tara: Hangisi hareket, hangisi gemi adı
      for (let i = 0; i < cols.length; i++) {
        const val = cols[i];
        if (val === "PLAN. GEÇİŞ" || val === "BOĞAZDA" || val === "GEÇİŞE HAZIR") {
          movement = val;
          if (cols[i + 1]) name = cols[i + 1];
        }
      }

      // Eğer movement üzerinden bulunamadıysa standart indislerden dene
      if (!name && cols[2] && cols[2].length > 1) {
        name = cols[2];
        movement = cols[1] || "PLAN. GEÇİŞ";
      }

      if (name && name !== "Gemi Adı" && name !== "İşlemler") {
        allShips.push({
          bogaz: "CANAKKALE", // Varsayılan veya satırdan
          yon: "KUZEY-GÜNEY",
          hareket: movement || "PLAN. GEÇİŞ",
          name: name,
          time: cols[1] || movement,
          len: cols[3] || "-",
          type: cols[4] || "-",
          pilotReq: cols[5] || "Hayır",
          tug: cols[6] || "Hayır"
        });
      }
    }
  }

  // İlk 3 gemi örneğini loga yazdır
  console.log("Ayıklanan gemi sayısı:", allShips.length);
  if (allShips.length > 0) {
    console.log("Örnek Gemi 1:", JSON.stringify(allShips[0]));
    console.log("Örnek Gemi 2:", JSON.stringify(allShips[1]));
  } else {
    // Eğer hala 0 ise satır örneğini bas
    if (rowMatches.length > 1) {
      console.log("Örnek Satır HTML:", rowMatches[1].slice(0, 300));
    }
  }

  fs.writeFileSync("ships.json", JSON.stringify(allShips, null, 2));
}

scrape();
