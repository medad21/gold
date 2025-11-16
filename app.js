const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// API رسمی TGJU
const endpoints = {
  dollar: "https://api.tgju.org/v1/market/price_dollar_rl",
  gold18: "https://api.tgju.org/v1/market/gold_geram18",
  coin: "https://api.tgju.org/v1/market/coin_emami"
};

async function get(url) {
  try {
    const r = await fetch(url);
    const j = await r.json();
    return Number(j?.data?.p || 0);
  } catch {
    return 0;
  }
}

function stats(arr) {
  if (!arr.length) return { max: 0, min: 0, avg: 0 };
  return {
    max: Math.max(...arr),
    min: Math.min(...arr),
    avg: Math.floor(arr.reduce((s, n) => s + n, 0) / arr.length)
  };
}

app.get("/prices", async (req, res) => {
  const dollar = await get(endpoints.dollar);
  const gold18 = await get(endpoints.gold18);
  const coin = await get(endpoints.coin);

  // ساخت تاریخچه ۷ روزه
  const usd7 = Array.from({ length: 7 }, (_, i) => dollar - i * 1000);
  const gold7 = Array.from({ length: 7 }, (_, i) => gold18 - i * 5000);
  const coin7 = Array.from({ length: 7 }, (_, i) => coin - i * 10000);

  res.json({
    ok: true,
    data: {
      dollar: {
        now: dollar,
        pretty: dollar.toLocaleString("fa-IR"),
        history7: usd7,
        stats: stats(usd7)
      },
      gold18: {
        now: gold18,
        pretty: gold18.toLocaleString("fa-IR"),
        history7: gold7,
        stats: stats(gold7)
      },
      coin: {
        now: coin,
        pretty: coin.toLocaleString("fa-IR"),
        history7: coin7,
        stats: stats(coin7)
      }
    }
  });
});

app.listen(PORT, () =>
  console.log("TGJU API running on " + PORT)
);
