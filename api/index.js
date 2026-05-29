
// ============ TICKERS ============
const TICKERS = {
  KOSPI:        { yahoo:'^KS11',     group:'KR_INDEX', label:'KOSPI',        sub:'Korea',     fmt:'pt',  kr:true  },
  KOSDAQ:       { yahoo:'^KQ11',     group:'KR_INDEX', label:'KOSDAQ',       sub:'Korea',     fmt:'pt',  kr:true  },
  NASDAQ:       { yahoo:'^IXIC',     group:'US_INDEX', label:'NASDAQ',       sub:'US',        fmt:'pt',  kr:false },
  SP500:        { yahoo:'^GSPC',     group:'US_INDEX', label:'S&P 500',      sub:'US',        fmt:'pt',  kr:false },
  VIX:          { yahoo:'^VIX',      group:'US_INDEX', label:'VIX',          sub:'공포지수',  fmt:'raw', kr:false },
  WTI:          { yahoo:'CL=F',      group:'ASSET',    label:'WTI 원유',     sub:'USD/bbl',   fmt:'usd', kr:false },
  GOLD:         { yahoo:'GC=F',      group:'ASSET',    label:'금',           sub:'USD/oz',    fmt:'usd', kr:false },
  BTC:          { yahoo:'BTC-USD',   group:'ASSET',    label:'Bitcoin',      sub:'USD',       fmt:'usd', kr:false },
  USD_KRW:      { yahoo:'KRW=X',     group:'MACRO',    label:'USD/KRW',      sub:'원',        fmt:'krw2',kr:false },
  US10Y:        { yahoo:'^TNX',      group:'MACRO',    label:'US 10년물',    sub:'국채금리',  fmt:'bnd', kr:false },
  삼성전자:     { yahoo:'005930.KS', group:'KR_STOCK', label:'삼성전자',     sub:'005930',    fmt:'krw', kr:true  },
  SK하이닉스:   { yahoo:'000660.KS', group:'KR_STOCK', label:'SK하이닉스',   sub:'000660',    fmt:'krw', kr:true  },
  HD현대중공업: { yahoo:'329180.KS', group:'KR_STOCK', label:'HD현대중공업', sub:'329180',    fmt:'krw', kr:true  },
  한화에어로:   { yahoo:'012450.KS', group:'KR_STOCK', label:'한화에어로',   sub:'012450',    fmt:'krw', kr:true  },
  NVDA:         { yahoo:'NVDA',      group:'US_STOCK', label:'NVIDIA',       sub:'NVDA',      fmt:'usd', kr:false },
  MU:           { yahoo:'MU',        group:'US_STOCK', label:'Micron',       sub:'MU',        fmt:'usd', kr:false },
  MSFT:         { yahoo:'MSFT',      group:'US_STOCK', label:'Microsoft',    sub:'MSFT',      fmt:'usd', kr:false },
  META:         { yahoo:'META',      group:'US_STOCK', label:'Meta',         sub:'META',      fmt:'usd', kr:false },
};

const CHART_KEYS = ['KOSPI','NASDAQ','SK하이닉스','NVDA','GOLD','BTC'];
const NEWS_QUERIES = [
  { label:'국내 증시',  tag:'📈', q:'코스피 코스닥 주식시장' },
  { label:'미국 증시',  tag:'🌐', q:'미국증시 나스닥 월가' },
  { label:'지정학',     tag:'⚔️', q:'전쟁 지정학 이란 중동 러시아' },
  { label:'반도체/AI',  tag:'💾', q:'반도체 AI HBM 하이닉스 엔비디아' },
];

// ============ FETCH PRICE ============
async function fetchPrice(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`;
  const res = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0','Accept':'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) throw new Error('no meta');
  const price   = meta.regularMarketPrice;
  const prev    = meta.chartPreviousClose ?? meta.previousClose;
  const pct     = prev ? ((price - prev) / prev) * 100 : 0;
  const dayHigh = meta.regularMarketDayHigh;
  const dayLow  = meta.regularMarketDayLow;
  const wkHigh  = meta.fiftyTwoWeekHigh;
  const wkLow   = meta.fiftyTwoWeekLow;
  const ts      = result?.timestamp || [];
  const closes  = result?.indicators?.quote?.[0]?.close || [];
  const vols    = result?.indicators?.quote?.[0]?.volume || [];
  const history = ts.map((t,i)=>({
    date: new Date(t*1000).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'}),
    close: closes[i], vol: vols[i]
  })).filter(d=>d.close!=null);
  return { price, pct, dayHigh, dayLow, wkHigh, wkLow, history };
}

// ============ FETCH NEWS ============
async function fetchNews(q, n=4) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
    const res = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < n) {
      const s = m[1];
      const title  = (/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(s)||[])[1]||'';
      const link   = (/<link>(.*?)<\/link>/.exec(s)||[])[1]||'#';
      const source = (/<source[^>]*>(.*?)<\/source>/.exec(s)||[])[1]||'';
      const pubRaw = (/<pubDate>(.*?)<\/pubDate>/.exec(s)||[])[1]||'';
      let clean = title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
      if (source && clean.endsWith(` - ${source}`)) clean = clean.slice(0,-(` - ${source}`).length).trimEnd();
      if (!clean) continue;
      let pub = '';
      try { pub = new Date(pubRaw).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); } catch{}
      items.push({ title:clean, link:link.trim(), source:source.replace(/&amp;/g,'&'), pub });
    }
    return items;
  } catch { return []; }
}

// ============ CLAUDE API ============
async function callClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json','anthropic-version':'2023-06-01','x-api-key':key },
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:8000,
        messages:[{ role:'user', content:prompt }]
      })
    });
    const data = await res.json();
    return (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
  } catch { return null; }
}

// ============ FORMAT ============
function fmtPrice(price, fmt) {
  if (!price && price !== 0) return '—';
  switch(fmt) {
    case 'pt':   return price.toLocaleString('en-US',{maximumFractionDigits:2});
    case 'usd':  return '$'+price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    case 'krw':  return price.toLocaleString('ko-KR',{maximumFractionDigits:0})+'원';
    case 'krw2': return price.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})+'원';
    case 'bnd':  return price.toFixed(3)+'%';
    case 'raw':  return price.toFixed(2);
    default:     return String(price);
  }
}

function pctColor(pct, kr) {
  if (pct >= 0) return kr ? '#e53935' : '#2e7d32';
  return kr ? '#1e88e5' : '#c62828';
}

function sparkSVG(history, kr) {
  if (!history || history.length < 2) return '';
  const closes = history.map(h=>h.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = max - min || min*0.01 || 1;
  const W=80, H=32, p=3;
  const pts = closes.map((v,i)=>{
    const x = (p + (i/(closes.length-1))*(W-p*2)).toFixed(1);
    const y = (p + (H-p*2) - ((v-min)/range)*(H-p*2)).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const up = closes[closes.length-1] >= closes[0];
  const color = pctColor(up ? 1 : -1, kr);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ============ HTML BUILDER ============
function buildHTML(data, newsGroups, analysis, now) {

  // Market indicator card
  function indCard(key) {
    const d = data[key];
    if (!d || !d.ok) return `<div class="ind-card"><div class="ind-label">${TICKERS[key]?.label||key}</div><div class="ind-val">—</div></div>`;
    const sign = d.pct >= 0 ? '▲' : '▼';
    const cls  = d.pct >= 0 ? (d.kr?'up-kr':'up-us') : (d.kr?'dn-kr':'dn-us');
    return `<div class="ind-card">
      <div class="ind-label">${d.label}</div>
      <div class="ind-val">${fmtPrice(d.price, d.fmt)}</div>
      <div class="ind-chg"><span class="${cls}">${sign} ${Math.abs(d.pct).toFixed(2)}%</span></div>
    </div>`;
  }

  // Stock recommendation card
  function stockCard(key) {
    const d = data[key];
    if (!d || !d.ok) return '';
    const sign = d.pct >= 0 ? '▲' : '▼';
    const cls  = d.pct >= 0 ? (d.kr?'up-kr':'up-us') : (d.kr?'dn-kr':'dn-us');
    const bdr  = d.pct >= 0 ? (d.kr?'bdr-up-kr':'bdr-up-us') : (d.kr?'bdr-dn-kr':'bdr-dn-us');
    const dh = d.dayHigh ? fmtPrice(d.dayHigh, d.fmt) : '—';
    const dl = d.dayLow  ? fmtPrice(d.dayLow,  d.fmt) : '—';
    return `<div class="stock-card ${bdr}">
      <div class="stock-header">
        <div>
          <div class="stock-name">${d.label}</div>
          <div class="stock-sub">${d.sub}</div>
        </div>
        <div class="stock-spark">${sparkSVG(d.history, d.kr)}</div>
      </div>
      <div class="stock-price">${fmtPrice(d.price, d.fmt)}</div>
      <div class="stock-chg"><span class="${cls}">${sign} ${Math.abs(d.pct).toFixed(2)}%</span></div>
      <div class="stock-hl">고 ${dh} &nbsp; 저 ${dl}</div>
    </div>`;
  }

  // Chart section (click to expand)
  function chartSection() {
    const items = CHART_KEYS.map(k=>data[k]).filter(d=>d&&d.ok&&d.history.length>1);
    if (!items.length) return '';
    const boxes = items.map(d=>{
      const id = 'ch_'+d.label.replace(/[^a-zA-Z0-9]/g,'_');
      return `<div class="chart-box" onclick="openChartModal('${id}','${d.label}','${d.sub||''}','${fmtPrice(d.price,d.fmt)}','${d.pct>=0?'▲':'▼'} ${Math.abs(d.pct).toFixed(2)}%','${d.kr?'true':'false'}')">
        <div class="chart-title">${d.label} <span class="chart-sub">1개월</span><span class="chart-expand">⤢</span></div>
        <canvas id="${id}" height="90"></canvas>
      </div>`;
    }).join('');

    const inits = items.map(d=>{
      const id    = 'ch_'+d.label.replace(/[^a-zA-Z0-9]/g,'_');
      const labels = JSON.stringify(d.history.map(h=>h.date));
      const vals   = JSON.stringify(d.history.map(h=>h.close));
      const up     = d.history[d.history.length-1].close >= d.history[0].close;
      const color  = pctColor(up?1:-1, d.kr);
      return `buildMiniChart('${id}',${labels},${vals},'${color}');`;
    }).join('\n  ');

    // Chart modal data
    const modalData = items.map(d=>{
      const id    = 'ch_'+d.label.replace(/[^a-zA-Z0-9]/g,'_');
      const labels = JSON.stringify(d.history.map(h=>h.date));
      const vals   = JSON.stringify(d.history.map(h=>h.close));
      const up     = d.history[d.history.length-1].close >= d.history[0].close;
      const color  = pctColor(up?1:-1, d.kr);
      const wkH    = d.wkHigh ? fmtPrice(d.wkHigh, d.fmt) : '—';
      const wkL    = d.wkLow  ? fmtPrice(d.wkLow,  d.fmt) : '—';
      const dH     = d.dayHigh ? fmtPrice(d.dayHigh, d.fmt) : '—';
      const dL     = d.dayLow  ? fmtPrice(d.dayLow,  d.fmt) : '—';
      const hi1m   = fmtPrice(Math.max(...d.history.map(h=>h.close)), d.fmt);
      const lo1m   = fmtPrice(Math.min(...d.history.map(h=>h.close)), d.fmt);
      return `'${id}':{labels:${labels},vals:${vals},color:'${color}',wkH:'${wkH}',wkL:'${wkL}',dH:'${dH}',dL:'${dL}',hi1m:'${hi1m}',lo1m:'${lo1m}'}`;
    }).join(',\n  ');

    return `<div class="section-wrap">
      <div class="section-title"><span class="section-icon">📈</span>주요 차트 (1개월) <span style="font-size:0.75rem;font-weight:400;color:var(--text3);">클릭 시 상세 보기</span></div>
      <div class="chart-scroll"><div class="chart-grid">${boxes}</div></div>
    </div>
    <script>
    const CHART_DATA = {${modalData}};
    let miniCharts = {};
    let modalBigChart = null;
    function buildMiniChart(id, labels, vals, color) {
      const ctx = document.getElementById(id);
      if (!ctx) return;
      miniCharts[id] = new Chart(ctx, {
        type:'line',
        data:{ labels, datasets:[{ data:vals, borderColor:color, borderWidth:2, pointRadius:0, tension:0.3, fill:true, backgroundColor:color+'20' }] },
        options:{ responsive:true, plugins:{ legend:{display:false}, tooltip:{enabled:false} }, scales:{ x:{display:false}, y:{display:false} }, animation:{duration:0} }
      });
    }
    document.addEventListener('DOMContentLoaded', function() { ${inits} });
    </script>`;
  }

  // News section
  function newsSection() {
    const groups = newsGroups.filter(g=>g.items.length>0);
    if (!groups.length) return '';
    const tabs = groups.map((g,i)=>`<button class="tab-btn${i===0?' active':''}" onclick="switchTab('news${i}',this)">${g.tag} ${g.label}</button>`).join('');
    const contents = groups.map((g,i)=>{
      const items = g.items.map(n=>`<a href="${n.link}" target="_blank" rel="noopener" class="news-item">
        <div class="news-title">${n.title}</div>
        <div class="news-meta">${n.source} · ${n.pub}</div>
      </a>`).join('');
      return `<div class="tab-content${i===0?' active':''}" id="news${i}">${items}</div>`;
    }).join('');
    return `<div class="section-wrap">
      <div class="section-title"><span class="section-icon">📰</span>주요 뉴스</div>
      <div class="tabs">${tabs}</div>
      ${contents}
    </div>`;
  }

  // Sector heatmap
  const sectorList = [
    { k:'ai',       icon:'🤖', name:'AI/데이터센터' },
    { k:'semi',     icon:'💾', name:'반도체/IT'      },
    { k:'defense',  icon:'🛡',  name:'방산/항공우주'  },
    { k:'energy',   icon:'⚡', name:'에너지/원자재'  },
    { k:'finance',  icon:'🏦', name:'금융/은행'       },
    { k:'bio',      icon:'💊', name:'바이오/헬스'     },
    { k:'ev',       icon:'🔋', name:'2차전지/EV'      },
    { k:'consumer', icon:'🛍',  name:'소비재/유통'    },
    { k:'shipping', icon:'✈️', name:'항공/해운/화학'  },
  ];

  const scores = analysis?.sectorScores || {};
  function heatCell(s) {
    const sc  = scores[s.k] ?? 0;
    const abs = Math.abs(sc);
    const cls = sc>=2?'h-up2':sc>=1?'h-up1':sc===0?'h-flat':sc>=-1?'h-dn1':'h-dn2';
    const col = sc>=0?(s.kr?'#b71c1c':'#1b5e20'):'#0d47a1';
    const txt = sc>=0?`+${sc}`:String(sc);
    return `<div class="heat-cell ${cls}" onclick="openSectorModal('${s.k}')">
      <div class="heat-icon">${s.icon}</div>
      <div class="heat-name">${s.name}</div>
      <div class="heat-score">${txt}</div>
    </div>`;
  }

  // Build sector modal JS data from analysis
  const sectorModalData = sectorList.map(s=>{
    const info = analysis?.sectorDetails?.[s.k] || {};
    const sc   = scores[s.k] ?? 0;
    const scTxt = sc>=0?`+${sc}점`:`${sc}점`;
    const scCls = sc>=2?'badge-up2':sc>=1?'badge-up1':sc===0?'badge-n':sc>=-1?'badge-d1':'badge-d2';
    const reason = (info.reason||'분석 데이터 없음').replace(/'/g,"\\'").replace(/\n/g,' ');
    const risk   = (info.risk  ||'').replace(/'/g,"\\'").replace(/\n/g,' ');
    const tags   = JSON.stringify(info.tags||[]);
    return `'${s.k}':{icon:'${s.icon}',name:'${s.name}',score:'${scTxt}',scoreClass:'${scCls}',reason:'${reason}',risk:'${risk}',tags:${tags}}`;
  }).join(',\n  ');

  // Macro scores for bar chart
  const macroScores = analysis?.macroScores || { 금리통화정책:0, 달러환율:0, 지정학리스크:0, 기업실적:0, 경기선행:0 };
  const macroLabels = JSON.stringify(Object.keys(macroScores));
  const macroVals   = JSON.stringify(Object.values(macroScores));

  // Radar scores
  const radarVals = JSON.stringify(sectorList.map(s=>(scores[s.k]??0)+3));

  // Summary points
  const summaryPoints = analysis?.summary || ['시장 데이터 수집 완료','분석 중...','자세한 내용은 아래 섹터 분석을 참고하세요'];
  const tempClass = (analysis?.temp||0)>=3?'temp-up':(analysis?.temp||0)<=-3?'temp-down':'temp-neutral';
  const tempText  = (analysis?.temp||0)>=3?'🟢 강세장':(analysis?.temp||0)<=-3?'🔴 약세 주의':'🟡 중립 관망';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>왕의 브리핑 — ${now}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700;900&family=Noto+Sans+KR:wght@300;400;500;700&family=Playfair+Display:ital,wght@0,700;0,900;1,400&display=swap" rel="stylesheet"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"><\/script>
<style>
:root{
  --bg:#f7f4ef;--surface:#fff;--surface2:#f1ece4;--surface3:#e8e0d4;
  --border:#d4c9b8;--text:#1a1510;--text2:#4a3f32;--text3:#8a7c6e;
  --up:#16a34a;--up-bg:#f0fdf4;--down:#dc2626;--down-bg:#fef2f2;
  --accent:#7c3aed;--gold:#b45309;--gold-bg:#fef3c7;
  --royal:#1e3a5f;--royal2:#2d5a8e;--warn:#d97706;
  --neutral:#6b7280;--neutral-bg:#f3f4f6;
  --shadow:0 4px 20px rgba(0,0,0,.08);--shadow-lg:0 8px 40px rgba(0,0,0,.12);
  --radius:16px;--radius-sm:10px;
}
.dark{
  --bg:#0f0d0a;--surface:#1c1814;--surface2:#252118;--surface3:#2e2820;
  --border:#3a3228;--text:#f5f0e8;--text2:#c8b89e;--text3:#7a6c5c;
  --up:#22c55e;--up-bg:#052e16;--down:#ef4444;--down-bg:#450a0a;
  --accent:#a78bfa;--gold:#fbbf24;--gold-bg:#451a03;
  --royal:#93c5fd;--royal2:#60a5fa;--warn:#fbbf24;
  --neutral:#9ca3af;--neutral-bg:#1f2937;
  --shadow:0 4px 20px rgba(0,0,0,.4);--shadow-lg:0 8px 40px rgba(0,0,0,.6);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);transition:background .3s,color .3s;min-height:100vh}

/* HEADER */
.royal-header{background:linear-gradient(135deg,#1e3a5f 0%,#0f2440 40%,#1a2d4a 70%,#2d4a7e 100%);padding:48px 32px 36px;text-align:center;position:relative;overflow:hidden}
.royal-header::before{content:'';position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")}
.royal-crown{font-size:2.5rem;margin-bottom:8px;display:block;filter:drop-shadow(0 2px 8px rgba(255,215,0,.4))}
.royal-title{font-family:'Playfair Display','Noto Serif KR',serif;font-size:clamp(2rem,5vw,3.2rem);font-weight:900;color:#f5e6c3;letter-spacing:-.02em;text-shadow:0 2px 20px rgba(0,0,0,.5);position:relative}
.royal-subtitle{font-size:.85rem;color:#9ab5d4;letter-spacing:.15em;text-transform:uppercase;margin-top:6px;position:relative}
.header-meta{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:20px;flex-wrap:wrap;position:relative}
.date-badge{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#e2d6b8;padding:6px 18px;border-radius:50px;font-size:.85rem;font-weight:500}
.temp-badge{padding:7px 20px;border-radius:50px;font-size:.85rem;font-weight:700;letter-spacing:.05em;border:2px solid}
.temp-neutral{background:rgba(107,114,128,.3);border-color:rgba(156,163,175,.6);color:#e5e7eb}
.temp-up{background:rgba(22,163,74,.3);border-color:rgba(34,197,94,.6);color:#bbf7d0}
.temp-down{background:rgba(220,38,38,.3);border-color:rgba(239,68,68,.6);color:#fecaca}
.dark-toggle{position:absolute;top:24px;right:24px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:50px;padding:8px 16px;cursor:pointer;font-size:.8rem;color:#e2d6b8;transition:all .2s}
.dark-toggle:hover{background:rgba(255,255,255,.25)}
.header-divider{width:80px;height:2px;background:linear-gradient(90deg,transparent,#f5e6c3,transparent);margin:16px auto 0;position:relative}

/* CONTAINER */
.container{max-width:1080px;margin:0 auto;padding:32px 20px 60px}

/* SECTION */
.section-wrap{margin-bottom:36px}
.section-title{font-family:'Playfair Display','Noto Serif KR',serif;font-size:1.35rem;font-weight:700;color:var(--text);margin-bottom:18px;display:flex;align-items:center;gap:10px}
.section-title::after{content:'';flex:1;height:1px;background:var(--border)}
.section-icon{font-size:1.1rem}

/* SUMMARY */
.summary-card{background:linear-gradient(135deg,var(--royal) 0%,var(--royal2) 100%);border-radius:var(--radius);padding:28px 32px;box-shadow:var(--shadow-lg);position:relative;overflow:hidden}
.dark .summary-card{background:linear-gradient(135deg,#1e3a5f 0%,#0f2440 100%)}
.summary-card::after{content:'👑';position:absolute;right:24px;top:50%;transform:translateY(-50%);font-size:4rem;opacity:.12}
.summary-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.15em;color:#93c5fd;font-weight:700;margin-bottom:12px}
.summary-points{list-style:none}
.summary-points li{color:#e8f4ff;font-size:.95rem;line-height:1.7;padding:6px 0 6px 20px;position:relative;font-weight:400}
.summary-points li::before{content:'▸';position:absolute;left:0;color:#fbbf24;font-size:.75rem;top:8px}

/* MARKET INDICATORS */
.ind-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.ind-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;box-shadow:var(--shadow)}
.ind-label{font-size:.7rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.ind-val{font-size:1.2rem;font-weight:800;color:var(--text);margin-bottom:3px}
.ind-chg{font-size:.8rem;font-weight:600}

/* CHARTS — 핵심 수정: 가로 스크롤 지원 */
.chart-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px}
.chart-grid{display:grid;grid-template-columns:repeat(${CHART_KEYS.length},minmax(200px,1fr));gap:12px;min-width:${CHART_KEYS.length*210}px}
.chart-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;cursor:pointer;transition:transform .2s,box-shadow .2s}
.chart-box:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg)}
.chart-title{font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:10px;display:flex;align-items:center;gap:6px}
.chart-sub{font-size:.7rem;color:var(--text3);font-weight:400}
.chart-expand{margin-left:auto;font-size:.75rem;color:var(--text3);opacity:.6}

/* STOCK CARDS */
.stock-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.stock-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;box-shadow:var(--shadow)}
.bdr-up-kr{border-color:#ffcdd2;background:#fff5f5}.dark .bdr-up-kr{border-color:#4a1010;background:#1c0e0e}
.bdr-dn-kr{border-color:#bbdefb;background:#f0f7ff}.dark .bdr-dn-kr{border-color:#0d2a4a;background:#0a1520}
.bdr-up-us{border-color:#c8e6c9;background:#f1fdf1}.dark .bdr-up-us{border-color:#0d3318;background:#0a1c0e}
.bdr-dn-us{border-color:#ffcdd2;background:#fff5f5}.dark .bdr-dn-us{border-color:#4a1010;background:#1c0e0e}
.stock-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.stock-name{font-size:.85rem;font-weight:700;color:var(--text)}
.stock-sub{font-size:.7rem;color:var(--text3);margin-top:2px}
.stock-spark{flex-shrink:0}
.stock-price{font-size:1.25rem;font-weight:800;color:var(--text);margin-bottom:4px}
.stock-chg{font-size:.8rem;font-weight:700;margin-bottom:6px}
.stock-hl{font-size:.7rem;color:var(--text3)}

/* MACRO CHART */
.chart-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:640px){.chart-pair{grid-template-columns:1fr}}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px 20px;box-shadow:var(--shadow)}
.chart-card-title{font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:12px}
.chart-wrap{position:relative;height:200px}

/* HEATMAP */
.heat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.heat-cell{border-radius:10px;padding:14px 10px;text-align:center;cursor:pointer;transition:transform .2s,box-shadow .2s;border:1px solid rgba(0,0,0,.06)}
.heat-cell:hover{transform:translateY(-3px) scale(1.03);box-shadow:var(--shadow-lg)}
.heat-icon{font-size:1.4rem;margin-bottom:5px}
.heat-name{font-size:.65rem;font-weight:700;color:rgba(0,0,0,.6);line-height:1.2}
.dark .heat-name{color:rgba(255,255,255,.7)}
.heat-score{font-size:1.1rem;font-weight:900;margin-top:4px}
.h-up2{background:linear-gradient(135deg,#bbf7d0,#86efac)}
.h-up1{background:linear-gradient(135deg,#dcfce7,#bbf7d0)}
.h-flat{background:linear-gradient(135deg,var(--surface2),var(--surface3))}
.h-dn1{background:linear-gradient(135deg,#fee2e2,#fecaca)}
.h-dn2{background:linear-gradient(135deg,#fecaca,#fca5a5)}

/* TABS */
.tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.tab-btn{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 16px;font-size:.8rem;font-weight:600;cursor:pointer;color:var(--text3);transition:all .2s;font-family:'Noto Sans KR'}
.tab-btn:hover{background:var(--surface3)}
.tab-btn.active{background:var(--accent);border-color:var(--accent);color:#fff}
.tab-content{display:none;flex-direction:column;gap:8px}
.tab-content.active{display:flex}
.news-item{display:block;text-decoration:none;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;transition:border-color .2s}
.news-item:hover{border-color:var(--accent)}
.news-title{font-size:.85rem;color:var(--text);line-height:1.5;margin-bottom:4px}
.news-meta{font-size:.7rem;color:var(--text3)}

/* COLORS */
.up-kr{color:#e53935;font-weight:700}.dn-kr{color:#1e88e5;font-weight:700}
.up-us{color:#2e7d32;font-weight:700}.dn-us{color:#c62828;font-weight:700}

/* MODAL — sector */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:1000;align-items:center;justify-content:center;padding:20px}
.modal-overlay.open{display:flex}
.modal-box{background:var(--surface);border-radius:18px;max-width:480px;width:100%;padding:28px;box-shadow:0 24px 60px rgba(0,0,0,.3);animation:springIn .35s cubic-bezier(.34,1.56,.64,1);max-height:85vh;overflow-y:auto}
@keyframes springIn{from{opacity:0;transform:scale(.85) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
.modal-header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.modal-icon{font-size:2rem}
.modal-title{font-size:1rem;font-weight:800;color:var(--text)}
.modal-score-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:700}
.badge-up2{background:#dcfce7;color:#15803d}.badge-up1{background:#dcfce7;color:#16a34a}
.badge-n{background:var(--neutral-bg);color:var(--neutral)}
.badge-d1{background:#fee2e2;color:#dc2626}.badge-d2{background:#fecaca;color:#b91c1c}
.modal-section-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin:14px 0 6px}
.modal-reason{font-size:.85rem;color:var(--text2);line-height:1.65}
.modal-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.modal-tag{background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:3px 10px;font-size:.7rem;color:var(--text3)}
.modal-risk{background:var(--gold-bg);border-left:3px solid var(--gold);border-radius:6px;padding:10px 12px;font-size:.8rem;color:var(--text2);line-height:1.6}
.modal-close-btn{width:100%;margin-top:16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:.85rem;font-weight:600;cursor:pointer;color:var(--text);transition:background .2s}
.modal-close-btn:hover{background:var(--surface3)}

/* MODAL — chart */
.chart-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:1100;align-items:center;justify-content:center;padding:20px}
.chart-modal-overlay.open{display:flex}
.chart-modal-box{background:var(--surface);border-radius:18px;max-width:640px;width:100%;padding:28px;box-shadow:0 24px 60px rgba(0,0,0,.4);animation:springIn .35s cubic-bezier(.34,1.56,.64,1)}
.chart-modal-title{font-size:1.1rem;font-weight:800;color:var(--text);margin-bottom:4px}
.chart-modal-price{font-size:1.8rem;font-weight:900;color:var(--text);margin-bottom:2px}
.chart-modal-chg{font-size:.9rem;font-weight:700;margin-bottom:16px}
.chart-modal-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
.stat-cell{background:var(--surface2);border-radius:8px;padding:10px 12px;text-align:center}
.stat-label{font-size:.65rem;color:var(--text3);text-transform:uppercase;margin-bottom:3px}
.stat-val{font-size:.85rem;font-weight:700;color:var(--text)}
.chart-modal-canvas{position:relative;height:220px;margin-bottom:16px}

/* DISCLAIMER */
.disclaimer{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;font-size:.75rem;color:var(--text3);line-height:1.7;margin-top:24px}
</style>
</head>
<body>

<div class="royal-header">
  <button class="dark-toggle" onclick="toggleDark()">🌙 다크모드</button>
  <span class="royal-crown">👑</span>
  <div class="royal-title">왕의 브리핑</div>
  <div class="royal-subtitle">Weekly Market Intelligence</div>
  <div class="header-meta">
    <span class="date-badge">📅 ${now}</span>
    <span class="temp-badge ${tempClass}">${tempText}</span>
  </div>
  <div class="header-divider"></div>
</div>

<div class="container">

  <!-- 3줄 요약 -->
  <div class="section-wrap">
    <div class="section-title"><span class="section-icon">📌</span>이번 주 핵심 요약</div>
    <div class="summary-card">
      <div class="summary-label">Executive Briefing</div>
      <ul class="summary-points">
        ${summaryPoints.map(p=>`<li>${p}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- 시장 지표 -->
  <div class="section-wrap">
    <div class="section-title"><span class="section-icon">📊</span>시장 지표</div>
    <div style="margin-bottom:12px">
      <div style="font-size:.75rem;font-weight:700;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.1em">국내</div>
      <div class="ind-grid" style="margin-bottom:12px">
        ${['KOSPI','KOSDAQ','삼성전자','SK하이닉스'].map(indCard).join('')}
      </div>
      <div style="font-size:.75rem;font-weight:700;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.1em">미국 · 매크로</div>
      <div class="ind-grid">
        ${['NASDAQ','SP500','VIX','WTI','GOLD','BTC','USD_KRW','US10Y'].map(indCard).join('')}
      </div>
    </div>
  </div>

  <!-- 차트 -->
  ${chartSection()}

  <!-- 매크로 분석 -->
  <div class="section-wrap">
    <div class="section-title"><span class="section-icon">🌡</span>매크로 환경 점수</div>
    <div class="chart-pair">
      <div class="chart-card">
        <div class="chart-card-title">매크로 요인별 점수 (−5 ~ +5)</div>
        <div class="chart-wrap"><canvas id="macroChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">섹터 영향도 레이더</div>
        <div class="chart-wrap"><canvas id="radarChart"></canvas></div>
      </div>
    </div>
  </div>

  <!-- 섹터 히트맵 -->
  <div class="section-wrap">
    <div class="section-title"><span class="section-icon">🗺</span>섹터 히트맵 <span style="font-size:.75rem;font-weight:400;color:var(--text3);">클릭 시 상세 분석</span></div>
    <div class="heat-grid">${sectorList.map(heatCell).join('')}</div>
  </div>

  <!-- 국내 추천주 -->
  <div class="section-wrap">
    <div class="section-title"><span class="section-icon">🇰🇷</span>국내 관심 종목</div>
    <div class="stock-grid">${['삼성전자','SK하이닉스','HD현대중공업','한화에어로'].map(stockCard).join('')}</div>
  </div>

  <!-- 미국 추천주 -->
  <div class="section-wrap">
    <div class="section-title"><span class="section-icon">🇺🇸</span>미국 관심 종목</div>
    <div class="stock-grid">${['NVDA','MU','MSFT','META'].map(stockCard).join('')}</div>
  </div>

  <!-- 뉴스 -->
  ${newsSection()}

  <!-- 면책 -->
  <div class="disclaimer">
    ⚖️ 본 대시보드는 정보 제공 목적으로만 작성되었으며 투자 권유가 아닙니다. 모든 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다. 데이터 출처: Yahoo Finance, Google News RSS. 생성 시각: ${now}
  </div>

</div>

<!-- 섹터 모달 -->
<div class="modal-overlay" id="sectorModal" onclick="closeSectorModalOutside(event)">
  <div class="modal-box">
    <div class="modal-header">
      <span class="modal-icon" id="mIcon"></span>
      <div>
        <div class="modal-title" id="mTitle"></div>
        <span class="modal-score-badge" id="mScore"></span>
      </div>
    </div>
    <div class="modal-section-title">📰 수혜/리스크 근거</div>
    <div class="modal-reason" id="mReason"></div>
    <div class="modal-section-title">🏷 핵심 키워드</div>
    <div class="modal-tags" id="mTags"></div>
    <div class="modal-section-title">⚠️ 주의사항</div>
    <div class="modal-risk" id="mRisk"></div>
    <button class="modal-close-btn" onclick="closeSectorModal()">✕ 닫기</button>
  </div>
</div>

<!-- 차트 모달 -->
<div class="chart-modal-overlay" id="chartModal" onclick="closeChartModalOutside(event)">
  <div class="chart-modal-box">
    <div class="chart-modal-title" id="cmTitle"></div>
    <div class="chart-modal-price" id="cmPrice"></div>
    <div class="chart-modal-chg" id="cmChg"></div>
    <div class="chart-modal-stats">
      <div class="stat-cell"><div class="stat-label">당일 고가</div><div class="stat-val" id="cmDH"></div></div>
      <div class="stat-cell"><div class="stat-label">당일 저가</div><div class="stat-val" id="cmDL"></div></div>
      <div class="stat-cell"><div class="stat-label">1개월 고</div><div class="stat-val" id="cm1H"></div></div>
      <div class="stat-cell"><div class="stat-label">1개월 저</div><div class="stat-val" id="cm1L"></div></div>
      <div class="stat-cell"><div class="stat-label">52주 고가</div><div class="stat-val" id="cmWH"></div></div>
      <div class="stat-cell"><div class="stat-label">52주 저가</div><div class="stat-val" id="cmWL"></div></div>
    </div>
    <div class="chart-modal-canvas"><canvas id="cmCanvas"></canvas></div>
    <button class="modal-close-btn" onclick="closeChartModal()">✕ 닫기</button>
  </div>
</div>

<script>
/* DARK MODE */
function toggleDark(){
  document.body.classList.toggle('dark');
  document.querySelector('.dark-toggle').textContent = document.body.classList.contains('dark')?'☀️ 라이트모드':'🌙 다크모드';
  updateAnalysisCharts();
}

/* TABS */
function switchTab(id, btn) {
  const parent = btn.closest('.section-wrap') || document;
  parent.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  parent.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

/* SECTOR MODAL */
const SECTOR_DATA = {${sectorModalData}};
function openSectorModal(key) {
  const d = SECTOR_DATA[key];
  if (!d) return;
  document.getElementById('mIcon').textContent = d.icon;
  document.getElementById('mTitle').textContent = d.name;
  const sb = document.getElementById('mScore');
  sb.textContent = d.score; sb.className = 'modal-score-badge '+d.scoreClass;
  document.getElementById('mReason').textContent = d.reason;
  document.getElementById('mTags').innerHTML = d.tags.map(t=>\`<span class="modal-tag">\${t}</span>\`).join('');
  document.getElementById('mRisk').textContent = d.risk || '—';
  document.getElementById('sectorModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSectorModal(){ document.getElementById('sectorModal').classList.remove('open'); document.body.style.overflow=''; }
function closeSectorModalOutside(e){ if(e.target.id==='sectorModal') closeSectorModal(); }

/* CHART MODAL */
let bigChart = null;
function openChartModal(id, name, sub, price, chg, kr) {
  const d = CHART_DATA[id];
  if (!d) return;
  document.getElementById('cmTitle').textContent = name + (sub?' ('+sub+')':'');
  document.getElementById('cmPrice').textContent = price;
  const chgEl = document.getElementById('cmChg');
  chgEl.textContent = chg;
  chgEl.className = 'chart-modal-chg ' + (chg.startsWith('▲') ? (kr==='true'?'up-kr':'up-us') : (kr==='true'?'dn-kr':'dn-us'));
  document.getElementById('cmDH').textContent = d.dH;
  document.getElementById('cmDL').textContent = d.dL;
  document.getElementById('cm1H').textContent = d.hi1m;
  document.getElementById('cm1L').textContent = d.lo1m;
  document.getElementById('cmWH').textContent = d.wkH;
  document.getElementById('cmWL').textContent = d.wkL;
  if (bigChart) { bigChart.destroy(); bigChart = null; }
  const ctx = document.getElementById('cmCanvas');
  bigChart = new Chart(ctx, {
    type:'line',
    data:{ labels:d.labels, datasets:[{ data:d.vals, borderColor:d.color, borderWidth:2.5, pointRadius:2, pointHoverRadius:5, tension:0.3, fill:true, backgroundColor:d.color+'18' }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>' '+ctx.parsed.y.toLocaleString() } } }, scales:{ x:{ ticks:{maxTicksLimit:8,font:{size:10}}, grid:{display:false} }, y:{ ticks:{font:{size:10},callback:v=>v.toLocaleString()}, grid:{color:'rgba(128,128,128,.1)'} } } }
  });
  document.getElementById('chartModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeChartModal(){ document.getElementById('chartModal').classList.remove('open'); document.body.style.overflow=''; if(bigChart){bigChart.destroy();bigChart=null;} }
function closeChartModalOutside(e){ if(e.target.id==='chartModal') closeChartModal(); }

/* MACRO/RADAR CHARTS */
let macroChart, radarChart;
function getTC(){ return document.body.classList.contains('dark')?'#c8b89e':'#4a3f32'; }
function getBC(){ return document.body.classList.contains('dark')?'#3a3228':'#d4c9b8'; }
function buildAnalysisCharts(){
  const tc=getTC(), bc=getBC();
  const mCtx = document.getElementById('macroChart').getContext('2d');
  macroChart = new Chart(mCtx,{
    type:'bar',
    data:{ labels:${macroLabels}, datasets:[{ data:${macroVals}, backgroundColor:ctx=>ctx.raw>=0?'rgba(22,163,74,.7)':'rgba(220,38,38,.7)', borderColor:ctx=>ctx.raw>=0?'#16a34a':'#dc2626', borderWidth:1, borderRadius:6 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>\`\${ctx.raw>0?'+':''}\${ctx.raw}점\`}} }, scales:{ x:{min:-4,max:4,grid:{color:bc},ticks:{color:tc,font:{size:10},callback:v=>\`\${v>0?'+':''}\${v}\`}}, y:{grid:{display:false},ticks:{color:tc,font:{size:10}}} } }
  });
  const rCtx = document.getElementById('radarChart').getContext('2d');
  radarChart = new Chart(rCtx,{
    type:'radar',
    data:{ labels:['AI/데이터센터','반도체/IT','방산','에너지','금융','바이오','2차전지','소비재','항공/해운'], datasets:[{ label:'섹터 영향도', data:${radarVals}, backgroundColor:'rgba(124,58,237,.2)', borderColor:'rgba(124,58,237,.8)', pointBackgroundColor:'rgba(124,58,237,1)', pointBorderColor:'#fff', borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, layout:{padding:{top:20,bottom:20,left:30,right:30}}, scales:{ r:{ min:0,max:5, angleLines:{color:bc}, grid:{color:bc}, pointLabels:{color:tc,font:{size:8},padding:8}, ticks:{display:false} } } }
  });
}
function updateAnalysisCharts(){
  if(!macroChart||!radarChart) return;
  const tc=getTC(), bc=getBC();
  macroChart.options.scales.x.grid.color=bc; macroChart.options.scales.x.ticks.color=tc; macroChart.options.scales.y.ticks.color=tc; macroChart.update();
  radarChart.options.scales.r.angleLines.color=bc; radarChart.options.scales.r.grid.color=bc; radarChart.options.scales.r.pointLabels.color=tc; radarChart.update();
}
window.addEventListener('DOMContentLoaded', buildAnalysisCharts);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeSectorModal(); closeChartModal(); } });
</script>
</body>
</html>`;
}

// ============ MAIN ============
export default async function handler(req, res) {
  console.log('[1/4] 주가 데이터 조회 중...');
  const entries = Object.entries(TICKERS);
  const priceResults = await Promise.allSettled(entries.map(([,info])=>fetchPrice(info.yahoo)));
  const data = {};
  for (let i=0; i<entries.length; i++) {
    const [key, info] = entries[i];
    const r = priceResults[i];
    data[key] = r.status==='fulfilled' ? {...info, ...r.value, ok:true} : {...info, ok:false};
  }

  console.log('[2/4] 뉴스 조회 중...');
  const newsResults = await Promise.allSettled(NEWS_QUERIES.map(n=>fetchNews(n.q, 5)));
  const newsGroups = NEWS_QUERIES.map((n,i)=>({
    label:n.label, tag:n.tag,
    items: newsResults[i].status==='fulfilled' ? newsResults[i].value : []
  }));

  console.log('[3/4] Claude AI 분석 중...');
  const priceSnapshot = Object.entries(data)
    .filter(([,d])=>d.ok)
    .map(([k,d])=>`${d.label}: ${fmtPrice(d.price,d.fmt)} (${d.pct>=0?'+':''}${d.pct.toFixed(2)}%)`)
    .join('\n');

  const analysisRaw = await callClaude(`
다음 실시간 시장 데이터를 바탕으로 한국어로 투자 분석해줘. JSON만 반환해 (마크다운 코드블록 없이):

${priceSnapshot}

형식:
{
  "temp": 숫자(-5~5, 전체시장온도),
  "summary": ["3줄요약1","3줄요약2","3줄요약3"],
  "macroScores": {"금리통화정책":숫자,"달러환율":숫자,"지정학리스크":숫자,"기업실적":숫자,"경기선행":숫자},
  "sectorScores": {"ai":숫자,"semi":숫자,"defense":숫자,"energy":숫자,"finance":숫자,"bio":숫자,"ev":숫자,"consumer":숫자,"shipping":숫자},
  "sectorDetails": {
    "ai":{"reason":"근거3~4문장","tags":["키워드1","키워드2","키워드3"],"risk":"리스크1~2문장"},
    "semi":{"reason":"...","tags":[...],"risk":"..."},
    "defense":{"reason":"...","tags":[...],"risk":"..."},
    "energy":{"reason":"...","tags":[...],"risk":"..."},
    "finance":{"reason":"...","tags":[...],"risk":"..."},
    "bio":{"reason":"...","tags":[...],"risk":"..."},
    "ev":{"reason":"...","tags":[...],"risk":"..."},
    "consumer":{"reason":"...","tags":[...],"risk":"..."},
    "shipping":{"reason":"...","tags":[...],"risk":"..."}
  }
}`);

  let analysis = null;
  if (analysisRaw) {
    try {
      const m = analysisRaw.match(/\{[\s\S]*\}/);
      if (m) analysis = JSON.parse(m[0]);
    } catch(e) { console.warn('분석 파싱 실패:', e.message); }
  }

  console.log('[4/4] HTML 생성 중...');
  const now = new Date().toLocaleString('ko-KR',{
    timeZone:'Asia/Seoul',
    year:'numeric',month:'long',day:'numeric',weekday:'short',
    hour:'2-digit',minute:'2-digit'
  });

  const html = buildHTML(data, newsGroups, analysis, now);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  res.status(200).send(html);
}

