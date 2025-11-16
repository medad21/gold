// app.js
const express = require("express");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

// helper: خواندن HTML با header مناسب
async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: "https://www.tgju.org/"
    },
    timeout: 15000
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.text();
}

// helper: از متن HTML عدد بزرگ (قیمت) را استخراج کن
function extractFirstLargeNumber(text) {
  // پیدا کردن نخستین عدد با 5+ رقم (ریال/تومان)
  const m = text.replace(/,/g, "").match(/\d{4,15}/g);
  if (!m || m.length === 0) return null;
  return Number(m[0]);
}

// تابع: قیمت کنونی دلار آزاد (ریال)
async function fetchDollarNow() {
  // صفحات TGJU که ممکن است قیمت را نگه دارند
  const urls = [
    "https://www.tgju.org/profile/price_dollar_rl",
    "https://english.tgju.org/profile/price_dollar_rl",
    "https://www.tgju.org/profile/price_dollar_rl/today"
  ];
  for (const url of urls) {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      // تلاش با سلکتورهای ممکن (چند گزینه را امتحان می‌کنیم)
      const selectors = [
        ".price .value, .last, .value, .instrument-price .value", // common patterns
        ".content .row .price", // fallback
        ".inner-info .lprice",
        ".data .price" // try some generic
      ];
      for (const sel of selectors) {
        const el = $(sel).first();
        if (el && el.text()) {
          const n = extractFirstLargeNumber(el.text());
          if (n) return n;
        }
      }
      // fallback: جستجوی در body text
      const bodyText = $("body").text();
      const v = extractFirstLargeNumber(bodyText);
      if (v) return v;
    } catch (e) {
      // console.warn("dollar try error", url, e.message);
      continue;
    }
  }
  return null;
}

// تابع: قیمت کنونی گرم 18
async function fetchGoldGramNow() {
  const urls = [
    "https://www.tgju.org/profile/geram18",
    "https://english.tgju.org/profile/geram18",
    "https://www.tgju.org/profile/geram18/today"
  ];
  for (const url of urls) {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      // سلکتورهای احتمالی
      const selectors = [
        ".last, .value, .instrument-price .value, .price .value",
        ".price .last, .info .price"
      ];
      for (const sel of selectors) {
        const el = $(sel).first();
        if (el && el.text()) {
          const n = extractFirstLargeNumber(el.text());
          if (n) return n;
        }
      }
      const v = extractFirstLargeNumber($("body").text());
      if (v) return v;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// تابع: قیمت کنونی سکه امامی
async function fetchCoinNow() {
  const urls = [
    "https://www.tgju.org/profile/coin",
    "https://www.tgju.org/profile/coin_emami",
    "https://english.tgju.org/profile/coin_emami",
    "https://www.tgju.org/profile/coin_emami/today"
  ];
  for (const url of urls) {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      // selectors
      const selectors = [".last, .value, .instrument-price .value, .price .value"];
      for (const sel of selectors) {
        const el = $(sel).first();
        if (el && el.text()) {
          const n = extractFirstLargeNumber(el.text());
          if (n) return n;
        }
      }
      const v = extractFirstLargeNumber($("body").text());
      if (v) return v;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// تابع: گرفتن تاریخچه 7 روز برای یک نماد از صفحه History/Archive
async function fetchHistory7(urlArchiveCandidates) {
  // تلاش برای یافتن جداول آرشیو و خواندن آخرین 7 قیمت
  for (const url of urlArchiveCandidates) {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      // جدول آرشیو معمولاً <table> دارد — تلاش برای خواندن سطرها
      const rows = $("table tbody tr");
      if (rows && rows.length > 0) {
        const prices = [];
        rows.each((i, r) => {
          if (prices.length >= 7) return;
          const tds = $(r).find("td");
          // معمولاً ستون قیمت در آخر یا دوم است
          let candidate = null;
          tds.each((j, td) => {
            const txt = $(td).text();
            const num = extractFirstLargeNumber(txt);
            if (num) candidate = num;
          });
          if (candidate) prices.push(candidate);
        });
        if (prices.length > 0) return prices.slice(0, 7);
      }

      // fallback: اگر جدول نبود، جستجوی ساده در متن برای آخرین اعداد
      const body = $("body").text();
      const allNums = (body.replace(/,/g, "").match(/\d{5,15}/g) || []).map(Number);
      if (allNums.length >= 7) return allNums.slice(0, 7);
    } catch (e) {
      continue;
    }
  }
  return [];
}

function analyze(values) {
  if (!values || values.length === 0) return { max: null, min: null, avg: null };
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return { max, min, avg };
}

function pretty(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return "ناموجود";
  return Number(n).toLocaleString("fa-IR");
}

app.get("/prices", async (req, res) => {
  try {
    // هم‌زمان سه قیمت را بگیر
    const [dnow, gnow, cnow] = await Promise.all([
      fetchDollarNow(),
      fetchGoldGramNow(),
      fetchCoinNow()
    ]);

    // گرفتن تاریخچه 7 روزه از آرشیو صفحات مربوطه (ترتیب آدرس‌های پیشنهادی)
    const dollarHistory = await fetchHistory7([
      "https://www.tgju.org/archive/price_dollar_rl",
      "https://english.tgju.org/archive/price_dollar_rl",
      "https://www.tgju.org/profile/price_dollar_rl/history"
    ]);
    const goldHistory = await fetchHistory7([
      "https://www.tgju.org/archive/geram18",
      "https://www.tgju.org/profile/geram18/history",
      "https://english.tgju.org/profile/geram18/history"
    ]);
    const coinHistory = await fetchHistory7([
      "https://www.tgju.org/archive/coin_emami",
      "https://www.tgju.org/profile/coin_emami/history",
      "https://english.tgju.org/profile/coin_emami/history"
    ]);

    const dollarStats = analyze(dollarHistory);
    const goldStats = analyze(goldHistory);
    const coinStats = analyze(coinHistory);

    res.json({
      ok: true,
      data: {
        dollar: { now: dnow, pretty: pretty(dnow), history7: dollarHistory, stats: dollarStats },
        gold18: { now: gnow, pretty: pretty(gnow), history7: goldHistory, stats: goldStats },
        coin: { now: cnow, pretty: pretty(cnow), history7: coinHistory, stats: coinStats }
      }
    });
  } catch (err) {
    console.error("handler error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.listen(PORT, () => console.log(`tgju-prices api listening on ${PORT}`));
