import { writeFileSync } from 'fs';
import { exec } from 'child_process';

const OUTPUT = process.env.OUTPUT_PATH || 'C:\\Users\\김현섭\\Desktop\\stock_dashboard.html';

const TICKERS = {
  'KOSPI':       { yahoo: '^KS11',     group: 'KR_INDEX', label: 'KOSPI',        sub: 'Korea',    fmt: 'pt',  kr: true  },
  'KOSDAQ':      { yahoo: '^KQ11',     group: 'KR_INDEX', label: 'KOSDAQ',       sub: 'Korea',    fmt: 'pt',  kr: true  },
  'NASDAQ':      { yahoo: '^IXIC',     group: 'US_INDEX', label: 'NASDAQ',       sub: 'US',       fmt: 'pt',  kr: false },
  'SP500':       { yahoo: '^GSPC',     group: 'US_INDEX', label: 'S&P 500',      sub: 'US',       fmt: 'pt',  kr: false },
  'VIX':         { yahoo: '^VIX',      group: 'US_INDEX', label: 'VIX',          sub: '공포지수', fmt: 'raw', kr: false },
  'WTI':         { yahoo: 'CL=F',      group: 'ASSET',    label: 'WTI 원유',     sub: 'USD/bbl',  fmt: 'usd', kr: false },
  'GOLD':        { yahoo: 'GC=F',      group: 'ASSET',    label: '금',           sub: 'USD/oz',   fmt: 'usd', kr: false },
  'BTC':         { yahoo: 'BTC-USD',   group: 'ASSET',    label: 'Bitcoin',      sub: 'USD',      fmt: 'usd', kr: false },
  'USD_KRW':     { yahoo: 'KRW=X',     group: 'MACRO',    label: 'USD/KRW',      sub: '원',       fmt: 'krw2',kr: false },
  'US10Y':       { yahoo: '^TNX',      group: 'MACRO',    label: 'US 10년물',    sub: '국채금리', fmt: 'bnd', kr: false },
  'KR10Y':       { yahoo: 'KR10YT=RR', group: 'MACRO',    label: 'KR 10년물',    sub: '국채금리', fmt: 'bnd', kr: false },
  '삼성전자':    { yahoo: '005930.KS', group: 'KR_STOCK', label: '삼성전자',     sub: '005930',   fmt: 'krw', kr: true  },
  'SK하이닉스':  { yahoo: '000660.KS', group: 'KR_STOCK', label: 'SK하이닉스',   sub: '000660',   fmt: 'krw', kr: true  },
  '한미반도체':  { yahoo: '042700.KS', group: 'KR_STOCK', label: '한미반도체',   sub: '042700',   fmt: 'krw', kr: true  },
  '리노공업':    { yahoo: '058470.KS', group: 'KR_STOCK', label: '리노공업',     sub: '058470',   fmt: 'krw', kr: true  },
  'HD현대중공업':{ yahoo: '329180.KS', group: 'KR_STOCK', label: 'HD현대중공업', sub: '329180',   fmt: 'krw', kr: true  },
  'NVDA':        { yahoo: 'NVDA',      group: 'US_STOCK', label: 'NVIDIA',       sub: 'NVDA',     fmt: 'usd', kr: false },
  'AAPL':        { yahoo: 'AAPL',      group: 'US_STOCK', label: 'Apple',        sub: 'AAPL',     fmt: 'usd', kr: false },
  'MSFT':        { yahoo: 'MSFT',      group: 'US_STOCK', label: 'Microsoft',    sub: 'MSFT',     fmt: 'usd', kr: false },
  'GOOGL':       { yahoo: 'GOOGL',     group: 'US_STOCK', label: 'Alphabet',     sub: 'GOOGL',    fmt: 'usd', kr: false },
  'META':        { yahoo: 'META',      group: 'US_STOCK', label: 'Meta',         sub: 'META',     fmt: 'usd', kr: false },
  'AMZN':        { yahoo: 'AMZN',      group: 'US_STOCK', label: 'Amazon',       sub: 'AMZN',     fmt: 'usd', kr: false },
  'MU':          { yahoo: 'MU',        group: 'US_STOCK', label: 'Micron',       sub: 'MU',       fmt: 'usd', kr: false },
  'TSM':         { yahoo: 'TSM',       group: 'US_STOCK', label: 'TSMC',         sub: 'TSM',      fmt: 'usd', kr: false },
};

const CHART_KEYS = ['KOSPI', 'NASDAQ', '삼성전자', 'SK하이닉스', 'NVDA', 'BTC'];

const NEWS_SOURCES = [
  { label: '국내 증시',  tag: '📈', query: '코스피 코스닥 주식시장' },
  { label: '미국 증시',  tag: '🌐', query: '미국증시 나스닥 월가' },
  { label: '반도체/AI', tag: '💾', query: '반도체 AI HBM 삼성 하이닉스' },
  { label: '빅테크',    tag: '🖥️', query: '엔비디아 애플 마이크로소프트 빅테크' },
];

// --- Data fetching ---

async function getPriceAndHistory(yahoo) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=1mo`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) throw new Error('no meta');
  const price = meta.regularMarketPrice;
  const prev  = meta.chartPreviousClose ?? meta.previousClose;
  const pct   = prev ? ((price - prev) / prev) * 100 : 0;
  const timestamps = result.timestamp || [];
  const rawCloses  = result.indicators?.quote?.[0]?.close || [];
  const history = timestamps
    .map((ts, i) => ({
      date:  new Date(ts * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
      close: rawCloses[i],
    }))
    .filter(d => d.close != null);
  return { price, pct, history };
}

async function getNewsGoogle(query, count = 5) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/xml, text/xml' },
    });
    if (!res.ok) return [];
    const xml   = await res.text();
    const items = [];
    const re    = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < count) {
      const s      = m[1];
      const title  = (/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(s) || [])[1] || '';
      const link   = (/<link>(.*?)<\/link>/.exec(s) || [])[1] || '#';
      const source = (/<source[^>]*>(.*?)<\/source>/.exec(s) || [])[1] || '';
      const pubRaw = (/<pubDate>(.*?)<\/pubDate>/.exec(s) || [])[1] || '';
      let clean = title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
      if (source && clean.endsWith(` - ${source}`)) clean = clean.slice(0, -(` - ${source}`).length).trimEnd();
      if (!clean) continue;
      let pub = '';
      try { pub = new Date(pubRaw).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
      catch { pub = pubRaw.substring(5, 16); }
      items.push({ title: clean, link: link.trim(), source: source.replace(/&amp;/g,'&'), pub });
    }
    return items;
  } catch {
    return [];
  }
}

// --- Formatting ---

function fmtPrice(price, fmt) {
  switch (fmt) {
    case 'pt':   return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
    case 'usd':  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'krw':  return price.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '원';
    case 'krw2': return price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '원';
    case 'bnd':  return price.toFixed(3) + '%';
    case 'raw':  return price.toFixed(2);
    default:     return String(price);
  }
}

function fmtPct(pct, kr) {
  const sign = pct >= 0 ? '▲' : '▼';
  const cls  = pct >= 0 ? (kr ? 'up-kr' : 'up-us') : (kr ? 'dn-kr' : 'dn-us');
  return `<span class="${cls}">${sign} ${Math.abs(pct).toFixed(2)}%</span>`;
}

function upColor(kr, up) {
  if (kr)  return up ? '#e53935' : '#1e88e5';
  return up ? '#2e7d32' : '#c62828';
}

// --- Sparkline SVG ---

function sparkline(history, kr) {
  if (!history || history.length < 2) return '';
  const closes = history.map(h => h.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = max - min || min * 0.01 || 1;
  const W = 72, H = 28, pad = 2;
  const pts = closes.map((p, i) => {
    const x = (pad + (i / (closes.length - 1)) * (W - pad * 2)).toFixed(1);
    const y = (pad + (H - pad * 2) - ((p - min) / range) * (H - pad * 2)).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const color = upColor(kr, closes[closes.length - 1] >= closes[0]);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// --- HTML components ---

function cardHtml(item) {
  if (!item.ok) {
    return `<div class="card"><div class="card-name">${item.label}</div><div class="card-sub">${item.sub}</div><div class="card-val error">조회 실패</div></div>`;
  }
  const bdr = item.pct >= 0 ? (item.kr ? 'bdr-up-kr' : 'bdr-up-us') : (item.kr ? 'bdr-dn-kr' : 'bdr-dn-us');
  return `<div class="card ${bdr}">
    <div class="card-hdr">
      <div><div class="card-name">${item.label}</div><div class="card-sub">${item.sub}</div></div>
      <div class="card-spark">${sparkline(item.history, item.kr)}</div>
    </div>
    <div class="card-val">${fmtPrice(item.price, item.fmt)}</div>
    <div class="card-chg">${fmtPct(item.pct, item.kr)}</div>
  </div>`;
}

function rowHtml(key, item) {
  if (!item.ok) {
    return `<tr><td><b>${item.label}</b><div class="sub">${key}</div></td><td class="r">—</td><td class="r">—</td><td class="r spark"></td></tr>`;
  }
  return `<tr>
    <td><b>${item.label}</b><div class="sub">${item.sub}</div></td>
    <td class="r price">${fmtPrice(item.price, item.fmt)}</td>
    <td class="r">${fmtPct(item.pct, item.kr)}</td>
    <td class="r spark">${sparkline(item.history, item.kr)}</td>
  </tr>`;
}

function cardsBlock(data, group) {
  return `<div class="cards">${Object.values(data).filter(d => d.group === group).map(cardHtml).join('')}</div>`;
}

function tableBlock(data, group, priceHeader) {
  const rows = Object.entries(data).filter(([,d]) => d.group === group).map(([k,d]) => rowHtml(k,d)).join('');
  return `<table>
    <thead><tr><th>종목</th><th class="r">${priceHeader}</th><th class="r">등락</th><th class="r">1개월</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function chartsBlock(data) {
  const items = CHART_KEYS.map(k => data[k]).filter(d => d && d.ok && d.history.length > 1);
  if (!items.length) return '';

  const canvases = items.map(item => {
    const id = 'c_' + item.label.replace(/[^a-zA-Z0-9]/g, '_');
    return `<div class="chart-box">
      <div class="chart-title">${item.label} <span class="chart-sub">1개월</span></div>
      <canvas id="${id}" height="110"></canvas>
    </div>`;
  }).join('');

  const inits = items.map(item => {
    const id     = 'c_' + item.label.replace(/[^a-zA-Z0-9]/g, '_');
    const labels = JSON.stringify(item.history.map(h => h.date));
    const vals   = JSON.stringify(item.history.map(h => h.close));
    const up     = item.history[item.history.length-1].close >= item.history[0].close;
    const color  = upColor(item.kr, up);
    return `new Chart(document.getElementById('${id}'),{type:'line',data:{labels:${labels},datasets:[{data:${vals},borderColor:'${color}',borderWidth:2,pointRadius:0,tension:0.3,fill:true,backgroundColor:'${color}18'}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+ctx.parsed.y.toLocaleString()}}},scales:{x:{ticks:{maxTicksLimit:6,font:{size:10}},grid:{display:false}},y:{ticks:{font:{size:10},callback:v=>v.toLocaleString()},grid:{color:'#f0f2f5'}}}}});`;
  }).join('\n  ');

  return `<div class="sec">
    <div class="sec-title">주요 차트 (1개월)</div>
    <div class="chart-grid">${canvases}</div>
  </div>
  <script>document.addEventListener('DOMContentLoaded',function(){${inits}});</script>`;
}

function newsBlock(newsGroups) {
  const groups = newsGroups.filter(g => g.items.length > 0);
  if (!groups.length) return '';
  const html = groups.map(g => {
    const items = g.items.map(n =>
      `<a href="${n.link}" target="_blank" class="news-item">
        <div class="news-title">${n.title}</div>
        <div class="news-meta">${n.source} &middot; ${n.pub}</div>
      </a>`
    ).join('');
    return `<div class="news-col">
      <div class="news-grp-title">${g.tag} ${g.label}</div>
      ${items}
    </div>`;
  }).join('');
  return `<div class="sec"><div class="sec-title">주요 뉴스</div><div class="news-grid">${html}</div></div>`;
}

function sec(title, inner) {
  return `<div class="sec"><div class="sec-title">${title}</div>${inner}</div>`;
}

// --- Main ---

async function main() {
  console.log('데이터 조회 중...');
  const entries = Object.entries(TICKERS);

  const [priceRes, newsRes] = await Promise.all([
    Promise.allSettled(entries.map(([,info]) => getPriceAndHistory(info.yahoo))),
    Promise.allSettled(NEWS_SOURCES.map(n => getNewsGoogle(n.query, 5))),
  ]);

  const data = {};
  for (let i = 0; i < entries.length; i++) {
    const [key, info] = entries[i];
    const r = priceRes[i];
    data[key] = r.status === 'fulfilled'
      ? { ...info, ...r.value, ok: true }
      : { ...info, ok: false };
  }

  const newsGroups = NEWS_SOURCES.map((n, i) => ({
    label: n.label, tag: n.tag,
    items: newsRes[i].status === 'fulfilled' ? newsRes[i].value : [],
  }));

  writeFileSync(OUTPUT, buildHTML(data, newsGroups), 'utf8');
  console.log('저장 완료:', OUTPUT);
  if (!process.env.GITHUB_ACTIONS) exec(`start "" "${OUTPUT}"`);
}

// --- HTML builder ---

function buildHTML(data, newsGroups) {
  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>실시간 주가 대시보드</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></` + `script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;background:#f0f2f5;color:#1a1a2e;line-height:1.5}
    .wrap{max-width:820px;margin:28px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.09)}
    /* Header */
    .hdr{background:linear-gradient(135deg,#0f3460,#16213e,#1a1a2e);padding:32px 36px 24px;color:#fff}
    .hdr-label{font-size:10px;font-weight:700;letter-spacing:2px;color:#64b5f6;text-transform:uppercase;margin-bottom:8px}
    .hdr h1{font-size:24px;font-weight:800;margin-bottom:6px}
    .hdr-time{font-size:12px;color:#90caf9}
    .hdr-note{margin-top:14px;padding:10px 16px;background:rgba(255,255,255,.07);border-left:3px solid #64b5f6;border-radius:0 8px 8px 0;font-size:12.5px;color:#e3f2fd}
    /* Sections */
    .sec{padding:24px 36px;border-bottom:1px solid #f0f2f5}
    .sec:last-child{border-bottom:none}
    .sec-title{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#1565c0;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .sec-title::after{content:'';flex:1;height:1px;background:#e3f2fd}
    /* Cards */
    .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:10px}
    .card{border-radius:10px;padding:14px 16px;border:1px solid #e3eaf8;background:#f8faff}
    .bdr-up-kr{border-color:#ffcdd2;background:#fff5f5}
    .bdr-dn-kr{border-color:#bbdefb;background:#f0f7ff}
    .bdr-up-us{border-color:#c8e6c9;background:#f1fdf1}
    .bdr-dn-us{border-color:#ffcdd2;background:#fff5f5}
    .card-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
    .card-name{font-size:12px;color:#607d8b;font-weight:700}
    .card-sub{font-size:11px;color:#90a4ae;margin-top:1px}
    .card-spark{line-height:0;flex-shrink:0}
    .card-val{font-size:19px;font-weight:800;color:#0d1b2a;margin-bottom:4px}
    .card-chg{font-size:13px}
    /* Table */
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:10.5px;font-weight:700;color:#78909c;padding:0 8px 10px;letter-spacing:.5px;text-transform:uppercase}
    th.r{text-align:right}
    td{padding:10px 8px;font-size:13.5px;border-top:1px solid #f0f2f5;color:#0d1b2a;vertical-align:middle}
    td.r{text-align:right}
    td.price{font-weight:700}
    td.spark{line-height:0;width:80px}
    tr:first-child td{border-top:none}
    .sub{font-size:11px;color:#90a4ae;margin-top:1px}
    /* Charts */
    .chart-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
    .chart-box{background:#f8faff;border:1px solid #e3eaf8;border-radius:10px;padding:14px 16px}
    .chart-title{font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:10px}
    .chart-sub{font-size:11px;color:#90a4ae;font-weight:400}
    /* News */
    .news-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .news-col{background:#f8faff;border:1px solid #e3eaf8;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
    .news-grp-title{font-size:12px;font-weight:700;color:#1565c0;padding-bottom:8px;border-bottom:1px solid #e3eaf8;margin-bottom:2px}
    .news-item{display:block;text-decoration:none;padding:8px 10px;background:#fff;border-radius:6px;border:1px solid #eef2f8}
    .news-item:hover{border-color:#90caf9}
    .news-title{font-size:12.5px;color:#1a1a2e;line-height:1.5;margin-bottom:3px}
    .news-meta{font-size:11px;color:#90a4ae}
    /* Colors */
    .up-kr{color:#e53935;font-weight:700}
    .dn-kr{color:#1e88e5;font-weight:700}
    .up-us{color:#2e7d32;font-weight:700}
    .dn-us{color:#c62828;font-weight:700}
    .error{color:#90a4ae;font-size:14px}
    /* Footer */
    .ftr{padding:18px 36px;background:#f8faff;font-size:11px;color:#90a4ae;line-height:1.7}
  </style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="hdr-label">Real-time Stock Dashboard</div>
    <h1>실시간 주가 대시보드</h1>
    <div class="hdr-time">마지막 업데이트: ${now} (KST)</div>
    <div class="hdr-note">새 데이터가 필요하면 바탕화면의 <strong>주가업데이트.bat</strong>를 실행하세요</div>
  </div>
  ${sec('국내 시장 지수', cardsBlock(data, 'KR_INDEX'))}
  ${sec('미국 시장 지수', cardsBlock(data, 'US_INDEX'))}
  ${sec('원자재 · 암호화폐', cardsBlock(data, 'ASSET'))}
  ${sec('환율 · 채권금리', cardsBlock(data, 'MACRO'))}
  ${chartsBlock(data)}
  ${sec('국내 반도체주', tableBlock(data, 'KR_STOCK', '현재가'))}
  ${sec('미국 빅테크', tableBlock(data, 'US_STOCK', '현재가 (USD)'))}
  ${newsBlock(newsGroups)}
  <div class="ftr">
    <strong>데이터 출처:</strong> Yahoo Finance API (실시간 시세 + 1개월 차트), Yahoo Finance RSS (뉴스) &nbsp;|&nbsp; 생성: ${now}<br/>
    코스피 종목: 상승=빨강, 하락=파랑 &nbsp;|&nbsp; 미국 종목: 상승=초록, 하락=빨강 &nbsp;|&nbsp; 장 마감 후에는 종가 기준 표시
  </div>
</div>
</body>
</html>`;
}

main().catch(err => { console.error('오류:', err.message); process.exit(1); });
