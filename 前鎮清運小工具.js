// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: truck;

// =====================================================
//  前鎮清運 小工具(Scriptable)
//  顯示:選定車種／責任區的今天三趟時間(下一趟標亮)、天氣
//  設定方式(最簡單):在 Scriptable 點這個腳本按 ▶,照選單選完會自動複製設定文字,
//           再長按小工具 → 編輯小工具 → 「Parameter」貼上
//  也可以自己打:
//     例:垃圾車 1 ／ 回收車 13 ／ 廚餘車 西甲
//     回收車每月輪值:回收車 輪值 9 9月(9月是 9區／13區那組,之後每月1號自動換下一組;月份建議一定要寫)
//     也可以簡寫:垃1、回13、廚西甲
//     上班配套(加在最後):休36(休星期三、六,星期日 06:45 日配套)／休36守衛(星期日 10:00)／休6日(休星期六、日,星期三 09:45 三配套)
//       例:回收車 輪值 9 9月 休36 → 當天第三趟抵達後,改提醒明天的上班時間
// =====================================================

// ---- 可以自己改的設定 ----
const SITE_URL = "https://ksepb.github.io/test/";      // 清運 App 網址(點小工具會打開)
const DATA_URL = SITE_URL + "index.html";             // 時刻表從這裡讀,App 改了小工具就跟著變
const DEFAULT_PARAM = "垃圾車 1";                      // 沒填 Parameter 時顯示這個
const NO_SERVICE_DAYS = [0, 3];                       // 停收日:0=星期日、3=星期三(不需要就改成 [])
const RECYCLE_OFF_DAYS = [6];                         // 回收車另外固定休:6=星期六
// 這一天這種車有沒有收
function noService(cat, day){
  const w = day.getDay();
  return NO_SERVICE_DAYS.includes(w) || (cat === "回收車" && RECYCLE_OFF_DAYS.includes(w));
}
const WX_LAT = 22.5955, WX_LON = 120.3073;            // 天氣位置:前鎮區
const DATA_TTL = 6 * 60 * 60 * 1000;                  // 時刻表 6 小時重抓一次
const WX_TTL = 30 * 60 * 1000;                        // 天氣 30 分鐘重抓一次

// ---- 顏色(跟 App 一樣的深綠色系)----
const C = {
  bg1: new Color("#1c2217"), bg2: new Color("#12160f"),
  accent: new Color("#a8dc4a"), text: new Color("#f3f5ed"),
  dim: new Color("#9aa492"), past: new Color("#5d6656"),
  depart: new Color("#f3f5ed"), arrive: new Color("#9bc25c"),   // 跟網站一樣:出發白色、到達綠色
  rain: new Color("#7fbfee"), heat: new Color("#f4b877"), storm: new Color("#f19a9a"),
};

// =====================================================
//  讀資料(有快取,沒網路時用上次存的)
// =====================================================
const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "qianzhen-widget-cache.json");

function readCache(){
  try{ if(fm.fileExists(CACHE)) return JSON.parse(fm.readString(CACHE)); }catch(e){}
  return {};
}
function writeCache(c){
  try{ fm.writeString(CACHE, JSON.stringify(c)); }catch(e){}
}

// 從 index.html 裡找出 `const 名稱 = { ... };` 這段物件文字(會略過字串和註解裡的大括號)
function extractObject(src, name){
  const start = src.indexOf("const " + name + " = {");
  if(start < 0) return null;
  let i = src.indexOf("{", start), depth = 0, q = null;
  const begin = i;
  for(; i < src.length; i++){
    const ch = src[i], nx = src[i + 1];
    if(q){
      if(ch === "\\"){ i++; continue; }
      if(ch === q) q = null;
      continue;
    }
    if(ch === "/" && nx === "/"){ i = src.indexOf("\n", i); if(i < 0) break; continue; }
    if(ch === "/" && nx === "*"){ i = src.indexOf("*/", i + 2) + 1; if(i <= 0) break; continue; }
    if(ch === '"' || ch === "'" || ch === "`"){ q = ch; continue; }
    if(ch === "{") depth++;
    else if(ch === "}"){ depth--; if(depth === 0) return src.slice(begin, i + 1); }
  }
  return null;
}
function parseObject(src, name){
  const txt = extractObject(src, name);
  if(!txt) throw new Error("找不到 " + name);
  return (new Function("return (" + txt + ");"))();
}

async function loadSchedule(cache){
  const fresh = cache.sched && cache.sched.data && cache.sched.data.ends && (Date.now() - cache.sched.t < DATA_TTL);
  if(fresh) return { data: cache.sched.data, offline: false };
  try{
    const req = new Request(DATA_URL + "?t=" + Date.now());
    req.timeoutInterval = 15;
    const html = await req.loadString();
    const data = {
      truck: parseObject(html, "truckData"),
      recycle: parseObject(html, "recycleData"),
      kitchen: parseObject(html, "kitchenData"),
      pairs: parseObject(html, "zonePairs"),
    };
    // 沿線時刻表:每區每趟「最後一站」的時間(算出車在外面的時段,天氣看整段)
    data.ends = {};
    try{
      const line = parseObject(html, "officialLineData");
      const toMin = s => { const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
      for(const z in line){
        const trips = []; let last = null;
        (line[z].stops || []).forEach((st, i) => {
          const cur = toMin(st[0]);
          if(i === 0 || (cur !== null && last !== null && cur - last >= 40)) trips.push([]);
          trips[trips.length - 1].push(st);
          if(cur !== null) last = cur;
        });
        data.ends[z] = trips.map(tr => {
          for(let k = tr.length - 1; k >= 0; k--){
            const ts = String(tr[k][0]).match(/\d{1,2}:\d{2}/g);
            if(ts) return ts[ts.length - 1];
          }
          return null;
        });
      }
    }catch(e){}
    // 只留時間,備註不需要(檔案小一點)
    for(const k of ["truck", "recycle"]){
      for(const z in data[k]) data[k][z] = data[k][z].map(t => [t[0], t[1]]);
    }
    cache.sched = { t: Date.now(), data };
    return { data, offline: false };
  }catch(e){
    if(cache.sched) return { data: cache.sched.data, offline: true };
    throw e;
  }
}

async function loadWeather(cache){
  if(cache.wx && Date.now() - cache.wx.t < WX_TTL) return cache.wx.data;
  try{
    const url = "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${WX_LAT}&longitude=${WX_LON}`
      + "&current=temperature_2m,apparent_temperature,weather_code"
      + "&hourly=precipitation_probability,apparent_temperature,weather_code"
      + "&timezone=Asia%2FTaipei&forecast_days=2";
    const req = new Request(url);
    req.timeoutInterval = 10;
    const d = await req.loadJSON();
    const ok = d && d.current && typeof d.current.temperature_2m === "number"
      && d.hourly && Array.isArray(d.hourly.time) && d.hourly.time.length;
    if(!ok) throw new Error("天氣資料不完整");
    cache.wx = { t: Date.now(), data: d };
    return d;
  }catch(e){
    // 抓不到就用 3 小時內的舊資料;太舊就不顯示天氣,免得把昨天的天氣當成今天
    if(cache.wx && Date.now() - cache.wx.t < 3 * 60 * 60 * 1000) return cache.wx.data;
    return null;
  }
}

// =====================================================
//  解析 Parameter、算今天的班次
// =====================================================
function parseParam(p){
  // 輪值可以加上月份,例如「回收車 輪值 9 9月」= 9月是 9區／13區那組(之後照月份推算,最準)
  let month = null;
  let shift = null;
  const tokens = String(p || DEFAULT_PARAM).trim().split(/\s+/).filter(tk => {
    const mm = tk.match(/^(\d{1,2})月$/);
    if(mm && +mm[1] >= 1 && +mm[1] <= 12){ month = +mm[1]; return false; }
    // 上班配套:休36／休三六／休36守衛／休6日／休六日
    const sh = tk.match(/^休(36|三六|6日|六日)(守衛)?$/);
    if(sh){ shift = { key: /^(36|三六)$/.test(sh[1]) ? "休36" : "休6日", guard: !!sh[2] }; return false; }
    return true;
  });
  const s = tokens.join("");
  let cat = null;
  if(/^(垃圾車|垃圾|垃)/.test(s)) cat = "垃圾車";
  else if(/^(回收車|回收|回)/.test(s)) cat = "回收車";
  else if(/^(廚餘車|廚餘|廚)/.test(s)) cat = "廚餘車";
  let zone = s.replace(/^(垃圾車|垃圾|垃|回收車|回收|回|廚餘車|廚餘|廚)/, "").replace(/區$/, "");
  // 回收車每月輪值:「回收車 輪值 9」「回輪9」→ 這個月是 9區／13區那組,每月1號自動換下一組
  let rotate = false;
  if(cat === "回收車" && /^輪值?/.test(zone)){ rotate = true; zone = zone.replace(/^輪值?/, "").replace(/區$/, ""); }
  if(shift && shift.guard && shift.key !== "休36") shift.guard = false;   // 只有休三六那組有守衛
  return { cat, zone, rotate, month, shift };
}

// ---- 回收車每月輪值(順序跟 App 一樣)----
const RECYCLE_ROTATION = [["1","5"],["2","6"],["3","7"],["4","8"],["9","13"],["10","14"],["11","15"],["12","16"]];
// 第一次看到這個設定時,記下「這個月是第幾組」,之後每個月自動往下一組
function rotationAnchor(cache, param, zone, now, month){
  cache.rot = cache.rot || {};
  const idx = RECYCLE_ROTATION.findIndex(p => p.includes(zone));
  if(idx < 0) return null;
  // 有寫月份:直接用那個月當基準(取最近一次的那個月),不依賴快取,重裝 Scriptable 也不會算錯
  if(month){
    const y = month <= now.getMonth() + 1 ? now.getFullYear() : now.getFullYear() - 1;
    return { zone, idx, ym: `${y}-${pad(month)}` };
  }
  const a = cache.rot[param];
  if(a && a.zone === zone) return a;
  const anchor = { zone, idx, ym: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` };
  cache.rot[param] = anchor;
  return anchor;
}
function rotationPair(anchor, day){
  const [y, m] = anchor.ym.split("-").map(Number);
  const diff = (day.getFullYear() - y) * 12 + (day.getMonth() + 1 - m);
  const n = RECYCLE_ROTATION.length;
  return RECYCLE_ROTATION[((anchor.idx + diff) % n + n) % n];
}

// ---- 上班配套(兩組)----
// rest:休假的星期(0=日…6=六);special:沒有三趟、改上配套的日子與上班時間
const SHIFTS = {
  "休36":  { label: "休三六", rest: [3, 6], special: { 0: { time: "06:45", name: "日配套" } },
             guard: { 0: { time: "10:00", name: "日配套守衛" } } },
  "休6日": { label: "休六日", rest: [6, 0], special: { 3: { time: "09:45", name: "三配套" } } },
};
// 這一天是:休假／上配套／跑三趟
function dayPlan(day, shift){
  const def = SHIFTS[shift.key], w = day.getDay();
  if(def.rest.includes(w)) return { type: "rest" };
  const sp = (shift.guard && def.guard && def.guard[w]) || def.special[w];
  if(sp) return { type: "special", time: sp.time, name: sp.name };
  return { type: "trips" };
}

const pad = n => String(n).padStart(2, "0");
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
function atTime(base, hhmm){
  const m = String(hhmm || "").match(/(\d{1,2}):(\d{2})/);
  if(!m) return null;
  const d = new Date(base);
  d.setHours(+m[1], +m[2], 0, 0);
  return d;
}
function dayGroup(d){ const w = d.getDay(); return (w === 1 || w === 4) ? "monThu" : (w === 2 || w === 5) ? "tueFri" : null; }
const MON_THU = ["1","2","3","4","9","10","11","12"];
const TUE_FRI = ["5","6","7","8","13","14","15","16","17"];

// 回收車:今天不是這區的收運日,就換成同組的另一區(跟 App 一樣)
function effectiveZone(cat, zone, day, pairs){
  if(cat !== "回收車" || !pairs[zone]) return { zone, switchedFrom: null };
  const g = dayGroup(day);
  const zg = MON_THU.includes(zone) ? "monThu" : TUE_FRI.includes(zone) ? "tueFri" : null;
  if(g && zg && g !== zg) return { zone: pairs[zone], switchedFrom: zone };
  return { zone, switchedFrom: null };
}

function tripsFor(data, cat, zone, day){
  const labels = ["第一趟", "第二趟", "第三趟", "第四趟"];
  if(cat === "廚餘車"){
    const arr = data.kitchen[zone];
    if(!arr) return null;
    return arr.map((t, i) => { const dep = atTime(day, t); return { label: labels[i] || `第${i + 1}趟`, dep, end: new Date(dep.getTime() + 60 * 60 * 1000), depText: t, arrText: null }; });
  }
  const src = cat === "回收車" ? data.recycle : data.truck;
  const arr = src[zone];
  if(!arr) return null;
  const ends = (data.ends && data.ends[zone]) || [];
  return arr.map((t, i) => {
    const dep = atTime(day, t[0]);
    let end = ends[i] ? atTime(day, ends[i]) : null;
    if(!end || end < dep) end = new Date(dep.getTime() + 60 * 60 * 1000);
    return { label: labels[i] || `第${i + 1}趟`, dep, end, depText: t[0], arrText: t[1] };
  });
}

// 某一天要跑哪一區(輪值／一四二五換區)
function zoneForDay(data, cat, zone, day, anchor){
  if(anchor){
    const rotPair = rotationPair(anchor, day);
    return { zone: dayGroup(day) === "tueFri" ? rotPair[1] : rotPair[0], switchedFrom: null, rotPair };
  }
  const ez = effectiveZone(cat, zone, day, data.pairs || {});
  return { zone: ez.zone, switchedFrom: ez.switchedFrom, rotPair: null };
}
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// 有設定上班配套時:
//  跑三趟的日子 → 照常顯示,第三趟「抵達」後改提醒明天
//  星期三、日 → 照原本顯示隔天第一趟(配套上班時間前先提醒「今天上班」)
//  星期六休假 → 「今天休假」＋明天的上班時間
function shiftState(data, cat, zone, now, anchor, shift){
  const today = startOfDay(now);
  const plan = dayPlan(today, shift);
  const remindTomorrow = () => ({ mode: "remind", rem: remindFor(data, cat, zone, addDays(today, 1), "明天", anchor, shift) });
  // 星期三、日(停收日):不顯示「明天上班」,照原本方式顯示隔天第一趟;
  // 只有配套上班時間還沒到時,先提醒「今天上班 06:45」
  if(NO_SERVICE_DAYS.includes(today.getDay())){
    if(plan.type === "special"){
      const st = atTime(today, plan.time);
      if(st > now) return { mode: "remind", rem: { when: "今天", kind: "work", time: plan.time, sub: plan.name, at: st } };
    }
    const nx = findNext(data, cat, zone, now, anchor);
    return nx ? { mode: "trips", next: nx } : null;
  }
  if(plan.type === "trips"){
    const z = zoneForDay(data, cat, zone, today, anchor);
    const trips = tripsFor(data, cat, z.zone, today);
    if(!trips) return null;
    let idx = trips.findIndex(t => t.dep && t.dep > now);
    const last = trips[trips.length - 1];
    const lastEnd = atTime(today, last.arrText || last.depText);
    if(idx < 0 && lastEnd && lastEnd > now) idx = trips.length - 1;     // 第三趟出發後、抵達前:還是顯示第三趟
    if(idx > -1) return { mode: "trips", next: { day: today, add: 0, idx, trips, zone: z.zone, switchedFrom: z.switchedFrom, rotPair: z.rotPair, endAt: lastEnd } };
    return remindTomorrow();
  }
  if(plan.type === "special"){
    const st = atTime(today, plan.time);
    if(st > now) return { mode: "remind", rem: { when: "今天", kind: "work", time: plan.time, sub: plan.name, at: st } };
    return remindTomorrow();
  }
  // 今天休假
  return { mode: "remind", rem: { when: "今天", kind: "rest", then: remindFor(data, cat, zone, addDays(today, 1), "明天", anchor, shift) } };
}
function remindFor(data, cat, zone, day, when, anchor, shift){
  const plan = dayPlan(day, shift);
  if(plan.type === "rest") return { when, kind: "rest" };
  if(plan.type === "special") return { when, kind: "work", time: plan.time, sub: plan.name, at: atTime(day, plan.time) };
  const z = zoneForDay(data, cat, zone, day, anchor);
  const trips = tripsFor(data, cat, z.zone, day);
  if(!trips || !trips.length) return { when, kind: "rest" };
  const zoneTxt = /^\d+$/.test(z.zone) ? `${z.zone}區` : z.zone;
  return { when, kind: "work", time: trips[0].depText, sub: `第一趟 ${cat.replace("車", "")}${zoneTxt}`, at: trips[0].dep };
}

// 找「下一趟」:今天還沒出發的第一趟;今天都結束或停收,就找下一個收運日的第一趟
function findNext(data, cat, zone, now, anchor){
  for(let add = 0; add < 8; add++){
    const day = new Date(now); day.setDate(day.getDate() + add); day.setHours(0, 0, 0, 0);
    if(noService(cat, day)) continue;
    let ez, rotPair = null;
    if(anchor){
      // 輪值:這天所屬月份的那一組,星期二五跑後面那區,其他天跑前面那區
      rotPair = rotationPair(anchor, day);
      ez = { zone: dayGroup(day) === "tueFri" ? rotPair[1] : rotPair[0], switchedFrom: null };
    }else{
      ez = effectiveZone(cat, zone, day, data.pairs || {});
    }
    const trips = tripsFor(data, cat, ez.zone, day);
    if(!trips) return null;
    const idx = trips.findIndex(t => t.dep && t.dep > now);
    if(idx > -1) return { day, add, idx, trips, zone: ez.zone, switchedFrom: ez.switchedFrom, rotPair };
  }
  return null;
}

// =====================================================
//  天氣小工具
// =====================================================
function wxIcon(code, hour){
  const night = hour >= 18 || hour < 6;
  if(code === 0) return night ? "🌙" : "☀️";
  if(code === 1) return night ? "🌙" : "🌤️";
  if(code === 2) return night ? "☁️" : "⛅";
  if(code === 3) return "☁️";
  if(code === 45 || code === 48) return "🌫️";
  if(code >= 51 && code <= 57) return "🌦️";
  if(code >= 61 && code <= 67) return "🌧️";
  if(code >= 80 && code <= 82) return "🌦️";
  if(code >= 95) return "⛈️";
  return "🌡️";
}
function wxAt(wx, date){
  if(!wx || !date) return null;
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
  const i = wx.hourly.time.indexOf(key);
  if(i < 0) return null;
  return { rain: wx.hourly.precipitation_probability[i] ?? 0, feel: wx.hourly.apparent_temperature[i], code: wx.hourly.weather_code[i] };
}
// 一趟在外面的整段時間(出車 → 沿線最後一站),每個整點都看,挑最差的
function wxTrip(wx, t){
  if(!wx || !t || !t.dep) return null;
  const end = t.end || t.dep;
  let found = false, rain = -1, feel = -99, storm = false, stormHour = null, rainHour = null;
  const d = new Date(t.dep); d.setMinutes(0, 0, 0);
  for(; d <= end; d.setHours(d.getHours() + 1)){
    const h = wxAt(wx, d);
    if(!h) continue;
    found = true;
    if(h.code >= 95 && !storm){ storm = true; stormHour = d.getHours(); }
    if(h.rain > rain) rain = h.rain;
    if(h.rain >= 50 && rainHour === null) rainHour = d.getHours();
    if(typeof h.feel === "number" && h.feel > feel) feel = h.feel;
  }
  if(!found) return null;
  return { rain, feel, code: storm ? 95 : 0, stormHour, rainHour };
}
function wxColor(h){
  if(!h) return C.dim;
  if(h.code >= 95) return C.storm;
  if(h.rain >= 50) return C.rain;
  if(typeof h.feel === "number" && h.feel >= 36) return C.heat;
  return C.dim;
}

// =====================================================
//  畫小工具
// =====================================================
function baseWidget(){
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.bg1, C.bg2]; g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = SITE_URL;
  return w;
}
function txt(stack, s, size, color, bold){
  const t = stack.addText(s);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}
// 出發 → 到達(照網站配色:出發白、箭頭灰、到達綠;到達字小一號)
// 已過的趟數整列變淡(網站是半透明)
function timePair(stack, t, size, bold, past){
  const op = past ? 0.4 : 1;
  const d = txt(stack, t.depText, size, C.depart, bold); d.textOpacity = op;
  if(!t.arrText) return;
  stack.addSpacer(5);
  const a = txt(stack, "→", Math.round(size * 0.75), C.dim); a.textOpacity = op;
  stack.addSpacer(5);
  const r = txt(stack, t.arrText, Math.round(size * 0.82), C.arrive, bold); r.textOpacity = op;
}

function whenLabel(next){
  if(next.add === 0) return "";
  if(next.add === 1) return "明天 ";
  return `星期${WEEK[next.day.getDay()]} `;
}

function drawError(msg){
  const w = baseWidget();
  txt(w, "前鎮清運", 13, C.accent, true);
  w.addSpacer(6);
  const t = w.addText(msg);
  t.font = Font.systemFont(12); t.textColor = C.dim;
  return w;
}

function drawSmall(ctx){
  const { cat, zone, next, wx, now, offline } = ctx;
  const w = baseWidget();
  w.setPadding(12, 12, 12, 12);
  const head = w.addStack(); head.centerAlignContent();
  txt(head, `${cat.replace("車", "")} ${next.zone}${/^\d+$/.test(next.zone) ? "區" : ""}`, 13, C.accent, true);
  head.addSpacer();
  if(wx) txt(head, `${wxIcon(wx.current.weather_code, now.getHours())}${Math.round(wx.current.temperature_2m)}°`, 12, C.text);
  w.addSpacer(6);
  const t = next.trips[next.idx];
  txt(w, `${whenLabel(next)}${t.label}`, 12, C.dim);
  const d = txt(w, t.depText, 30, C.depart, true);
  if(t.arrText){ const r = txt(w, `→ ${t.arrText}`, 18, C.arrive, true); }
  w.addSpacer();
  const h = wxTrip(wx, t);
  const foot = w.addStack(); foot.centerAlignContent();
  if(h) txt(foot, h.code >= 95 ? `⛈️ ${h.stormHour}時起雷雨` : `☔ 最高 ${h.rain}%`, 11, wxColor(h));
  foot.addSpacer();
  if(offline) txt(foot, "離線", 10, C.past);
  w.refreshAfterDate = refreshAt(next, now);
  return w;
}

function drawMedium(ctx){
  const { cat, zone, next, wx, now, offline } = ctx;
  const w = baseWidget();
  w.setPadding(12, 14, 12, 14);

  // 標題列:車種／區域／星期 + 天氣
  const head = w.addStack(); head.centerAlignContent();
  const zoneTxt = /^\d+$/.test(next.zone) ? `${next.zone}區` : next.zone;
  txt(head, `${cat} ${zoneTxt}`, 14, C.accent, true);
  head.addSpacer(6);
  const dayTxt = next.add === 0 ? "今天" : next.add === 1 ? "明天" : `星期${WEEK[next.day.getDay()]}`;
  const sub = next.rotPair ? `${next.add > 0 ? dayTxt + " " : ""}${next.day.getMonth() + 1}月輪值 ${next.rotPair[0]}／${next.rotPair[1]}`
    : next.switchedFrom ? `(${dayTxt}對應,原${next.switchedFrom}區)`
    : next.add > 1 ? dayTxt : `${dayTxt}星期${WEEK[next.day.getDay()]}`;
  txt(head, sub, 11, C.dim);
  head.addSpacer();
  if(wx){
    const nowH = wxAt(wx, now);
    txt(head, `${wxIcon(wx.current.weather_code, now.getHours())} ${Math.round(wx.current.temperature_2m)}°`, 13, C.text, true);
    if(nowH){ head.addSpacer(4); txt(head, `☔${nowH.rain}%`, 12, wxColor(nowH)); }
  }
  w.addSpacer();   // 用彈性間距把三趟平均分配在中間,下方不會空一大塊

  // 三趟
  next.trips.forEach((t, i) => {
    const isNext = i === next.idx;
    const isPast = next.add === 0 && i < next.idx;
    const row = w.addStack(); row.centerAlignContent();
    const lab = txt(row, t.label, 13, isNext ? C.accent : C.dim, isNext);
    if(isPast) lab.textOpacity = 0.4;
    row.addSpacer(10);
    timePair(row, t, isNext ? 21 : 18, isNext, isPast);
    row.addSpacer();
    if(!isPast){
      const h = wxTrip(wx, t);
      if(h && (h.rain >= 50 || h.code >= 95 || h.feel >= 36)) txt(row, h.code >= 95 ? "⛈️" : h.rain >= 50 ? `☔${h.rain}%` : "🥵", 11, wxColor(h));
    }
    if(i < next.trips.length - 1) w.addSpacer();
  });

  w.addSpacer();
  const t = next.trips[next.idx];
  const h = wxTrip(wx, t);
  const foot = w.addStack(); foot.centerAlignContent();
  if(h && h.code >= 95) txt(foot, `⛈️ ${t.label} ${h.stormHour}時起可能雷雨,注意安全`, 11, wxColor(h));
  else if(h && h.rain >= 50) txt(foot, `🌧 ${t.label} ${h.rainHour}時起降雨 ${h.rain}%,記得帶雨具`, 11, wxColor(h));
  else if(h && h.feel >= 36) txt(foot, `🥵 ${t.label}體感最高 ${Math.round(h.feel)}°`, 11, wxColor(h));
  foot.addSpacer();
  txt(foot, offline ? "離線資料" : `更新 ${pad(now.getHours())}:${pad(now.getMinutes())}`, 9, C.past);
  w.refreshAfterDate = refreshAt(next, now);
  return w;
}

// 鎖定畫面(長方形)
function drawRect(ctx){
  const { cat, next } = ctx;
  const w = new ListWidget();
  w.url = SITE_URL;
  const t = next.trips[next.idx];
  const zoneTxt = /^\d+$/.test(next.zone) ? `${next.zone}區` : next.zone;
  // 鎖定畫面的顏色由 iPhone 決定(跟著時鐘顏色),這裡只控制大小和排版
  // 兩行:上面小字「回收9區 第一趟」,下面大字出車時間「15:50」
  const head = txt(w, `${cat.replace("車", "")}${zoneTxt} ${whenLabel(next)}${t.label}`, 13, Color.white(), true);
  head.font = roundFont("bold", 13); head.textOpacity = 0.85;
  w.addSpacer(1);
  const row = w.addStack(); row.bottomAlignContent();
  // 只顯示出車時間(不顯示到達),字可以放大
  const dep = txt(row, t.depText, 32, Color.white(), true); dep.font = roundFont("heavy", 32); dep.minimumScaleFactor = 0.8;
  row.addSpacer();
  w.refreshAfterDate = refreshAt(next, ctx.now);
  return w;
}
// 鎖定畫面(時間上方一行)
function drawInline(ctx){
  const { next } = ctx;
  const w = new ListWidget();
  const t = next.trips[next.idx];
  const icon = ctx.cat === "回收車" ? "♻️" : ctx.cat === "廚餘車" ? "🍃" : "🚛";
  txt(w, `${icon} ${whenLabel(next)}${t.label} ${t.depText}`, 12, Color.white());
  w.refreshAfterDate = refreshAt(next, ctx.now);
  return w;
}

// 鎖定畫面(小圓形):上面第幾趟、下面出發時間
function drawCircular(ctx){
  const { next } = ctx;
  const w = new ListWidget();
  w.url = SITE_URL;
  w.addAccessoryWidgetBackground = true;   // 圓形霧面底
  w.setPadding(2, 2, 2, 2);
  const t = next.trips[next.idx];
  const zoneTxt = /^\d+$/.test(next.zone) ? `${next.zone}區` : next.zone;
  const center = (stack, s, font, op) => {
    const r = stack.addStack(); r.addSpacer();
    const x = r.addText(s); x.font = font; x.textColor = Color.white();
    x.lineLimit = 1; x.minimumScaleFactor = 0.5; if(op) x.textOpacity = op;
    r.addSpacer();
  };
  w.addSpacer();
  center(w, zoneTxt, roundFont("bold", 11), 0.8);                        // 上:區域
  center(w, t.depText, roundFont("heavy", 20));                          // 中:出發時間(最大)
  center(w, t.label.replace("第", "").replace("趟", "") + "趟", roundFont("semibold", 11), 0.8); // 下:第幾趟
  w.addSpacer();
  w.refreshAfterDate = refreshAt(next, ctx.now);
  return w;
}

// =====================================================
//  上班提醒(第三趟抵達後、配套日、休假日)
// =====================================================
function remindText(rem){
  // 回傳 { head:「明天上班」, time:「06:45」或 null, sub:「日配套」, foot:(今天休假時)明天的安排 }
  if(rem.kind === "rest" && rem.then){
    const t = rem.then;
    return { head: "今天休假", time: null, sub: "",
             foot: t.kind === "rest" ? "明天也休假" : `明天 ${t.time} 上班(${t.sub})` };
  }
  if(rem.kind === "rest") return { head: `${rem.when}休假`, time: null, sub: "", foot: "" };
  return { head: `${rem.when}上班`, time: rem.time, sub: rem.sub, foot: "" };
}
function remindRefresh(rem, now){
  const cands = [new Date(now.getTime() + 30 * 60 * 1000)];
  const midnight = startOfDay(addDays(now, 1)); cands.push(new Date(midnight.getTime() + 60 * 1000));
  if(rem.at && rem.at > now) cands.push(new Date(rem.at.getTime() + 60 * 1000));
  return cands.reduce((a, b) => a < b ? a : b);
}
function drawRemind(ctx){
  const { rem, wx, now, fam, shift, offline } = ctx;
  const R = remindText(rem);
  const shiftLabel = SHIFTS[shift.key].label + (shift.guard ? "守衛" : "");
  // 鎖定畫面
  if(fam === "accessoryRectangular"){
    const w = new ListWidget(); w.url = SITE_URL;
    if(!R.time && !R.foot){
      // 只有「明天休假」:一行大字就好
      const t = txt(w, R.head, 26, Color.white(), true); t.font = roundFont("heavy", 26);
    }else{
      const h = txt(w, R.sub ? `${R.head} ${R.sub}` : R.head, 13, Color.white(), true);
      h.font = roundFont("bold", 13); h.textOpacity = 0.85;
      w.addSpacer(1);
      if(R.time){ const t = txt(w, R.time, 32, Color.white(), true); t.font = roundFont("heavy", 32); }
      else{ const t = txt(w, R.foot, 15, Color.white(), true); t.font = roundFont("bold", 15); t.minimumScaleFactor = 0.6; }
    }
    w.refreshAfterDate = remindRefresh(rem, now);
    return w;
  }
  if(fam === "accessoryCircular"){
    const w = new ListWidget(); w.url = SITE_URL;
    w.addAccessoryWidgetBackground = true; w.setPadding(2, 2, 2, 2);
    const center = (s, font, op) => {
      const r = w.addStack(); r.addSpacer();
      const x = r.addText(s); x.font = font; x.textColor = Color.white(); x.lineLimit = 1; x.minimumScaleFactor = 0.5;
      if(op) x.textOpacity = op; r.addSpacer();
    };
    w.addSpacer();
    center(R.head.slice(0, 2), roundFont("bold", 11), 0.8);                     // 今天／明天
    center(R.time || "休假", roundFont("heavy", R.time ? 20 : 18));
    center(R.time ? "上班" : "", roundFont("semibold", 11), 0.8);
    w.addSpacer();
    w.refreshAfterDate = remindRefresh(rem, now);
    return w;
  }
  if(fam === "accessoryInline"){
    const w = new ListWidget();
    txt(w, R.time ? `🗓 ${R.head} ${R.time}` : `🗓 ${R.head}`, 12, Color.white());
    w.refreshAfterDate = remindRefresh(rem, now);
    return w;
  }
  // 主畫面(小型／中型)
  const small = fam === "small";
  const w = baseWidget();
  w.setPadding(12, 14, 12, 14);
  const head = w.addStack(); head.centerAlignContent();
  txt(head, small ? "上班提醒" : `🗓 上班提醒`, small ? 13 : 14, C.accent, true);
  if(!small){ head.addSpacer(6); txt(head, shiftLabel, 11, C.dim); }
  head.addSpacer();
  if(wx) txt(head, `${wxIcon(wx.current.weather_code, now.getHours())} ${Math.round(wx.current.temperature_2m)}°`, small ? 12 : 13, C.text, !small);
  w.addSpacer();
  txt(w, R.head, small ? 14 : 16, R.time ? C.accent : C.text, true);
  if(R.time){
    const row = w.addStack(); row.bottomAlignContent();
    txt(row, R.time, small ? 34 : 40, C.depart, true);
    if(!small && R.sub){ row.addSpacer(10); const s2 = txt(row, R.sub, 15, C.arrive, true); }
    if(small && R.sub) txt(w, R.sub, 12, C.arrive, true);
  }
  if(R.foot){ w.addSpacer(4); txt(w, R.foot, small ? 12 : 14, C.dim); }
  w.addSpacer();
  const foot = w.addStack(); foot.centerAlignContent();
  if(rem.at && wx){
    const hh = wxAt(wx, rem.at);
    if(hh && (hh.rain >= 50 || hh.code >= 95)) txt(foot, `🌧 上班時降雨 ${hh.rain}%`, 11, wxColor(hh));
  }
  foot.addSpacer();
  if(!small) txt(foot, offline ? "離線資料" : `更新 ${pad(now.getHours())}:${pad(now.getMinutes())}`, 9, C.past);
  w.refreshAfterDate = remindRefresh(rem, now);
  return w;
}

// 圓角字體(比較柔和好看);舊版 Scriptable 沒有這個字體時退回一般粗體
function roundFont(weight, size){
  const map = { heavy: "heavyRoundedSystemFont", bold: "boldRoundedSystemFont", semibold: "semiboldRoundedSystemFont" };
  const fn = Font[map[weight]];
  return typeof fn === "function" ? fn.call(Font, size) : Font.boldSystemFont(size);
}

// 下一趟出發後 1 分鐘更新(標亮切到下一趟),最多 30 分鐘更新一次(天氣)
function refreshAt(next, now){
  let t = next.trips[next.idx].dep;
  if(t <= now && next.endAt) t = next.endAt;          // 第三趟已出發:等抵達後切到明天的提醒
  const a = new Date(t.getTime() + 60 * 1000);
  const b = new Date(now.getTime() + 30 * 60 * 1000);
  return a < b ? a : b;
}

// =====================================================
//  主程式
// =====================================================
async function main(paramOverride){
  const now = new Date();
  const rawParam = paramOverride || args.widgetParameter;
  const { cat, zone, rotate, month, shift } = parseParam(rawParam);
  if(!cat || !zone) return drawError(`Parameter 看不懂:「${rawParam || ""}」\n請到 Scriptable 點這個腳本按 ▶,照選單一步一步選,會自動產生要貼的文字`);

  const cache = readCache();
  let sched;
  try{ sched = await loadSchedule(cache); }
  catch(e){ return drawError("讀不到時刻表,請確認網路後再試一次"); }
  const wx = await loadWeather(cache);
  writeCache(cache);

  let anchor = null;
  if(rotate){
    anchor = rotationAnchor(cache, String(rawParam || ""), zone, now, month);
    if(!anchor) return drawError(`輪值只能填 1–16 區(17區不輪值)`);
    writeCache(cache);
  }
  const fam = config.widgetFamily;
  let next;
  if(shift){
    const st = shiftState(sched.data, cat, zone, now, anchor, shift);
    if(!st) return drawError(`找不到「${cat} ${zone}」的時刻表,請確認區域名稱`);
    if(st.mode === "remind") return drawRemind({ rem: st.rem, wx, now, fam, shift, offline: sched.offline });
    next = st.next;
  }else if(noService(cat, now) && fam === "accessoryRectangular"){
    // 沒選配套、今天是休假日(垃圾車星期三日、回收車星期三六日):鎖定畫面長條整個留白(看起來像隱藏),
    // 半夜 00:01 自動回來;主畫面、圓形、單行照原本顯示下一個收運日
    const w = new ListWidget(); w.url = SITE_URL;
    w.refreshAfterDate = new Date(startOfDay(addDays(now, 1)).getTime() + 60 * 1000);
    return w;
  }else{
    next = findNext(sched.data, cat, zone, now, anchor);
  }
  if(!next) return drawError(`找不到「${cat} ${zone}」的時刻表,請確認區域名稱`);

  const ctx = { cat, zone, next, wx, now, offline: sched.offline };
  if(fam === "small") return drawSmall(ctx);
  if(fam === "accessoryRectangular") return drawRect(ctx);
  if(fam === "accessoryCircular") return drawCircular(ctx);
  if(fam === "accessoryInline") return drawInline(ctx);
  return drawMedium(ctx);                     // medium、large、在 App 裡預覽
}

// =====================================================
//  設定精靈:在 Scriptable 裡按 ▶ 時,用選單一步一步選,
//  自動產生 Parameter 文字並複製,貼到小工具設定就好(不用自己打)
// =====================================================
async function pick(title, message, options){
  const a = new Alert();
  a.title = title;
  if(message) a.message = message;
  options.forEach(o => a.addAction(o));
  a.addCancelAction("取消");
  const i = await a.presentSheet();
  return i < 0 ? null : i;
}
async function setupWizard(){
  const now = new Date();
  const catIdx = await pick("① 選車種", "要在小工具上看哪一種車?", ["垃圾車", "回收車", "廚餘車"]);
  if(catIdx === null) return null;
  const cat = ["垃圾車", "回收車", "廚餘車"][catIdx];
  let param;
  if(cat === "廚餘車"){
    const ks = ["西甲", "籬仔內", "草衙"];
    const k = await pick("② 選區域", null, ks);
    if(k === null) return null;
    param = `廚餘車 ${ks[k]}`;
  }else if(cat === "回收車"){
    const r = await pick("② 有沒有每月輪值?", "有輪值的話,每月1號會自動換下一組", ["有,每月輪值", "沒有,固定一區"]);
    if(r === null) return null;
    if(r === 0){
      const opts = RECYCLE_ROTATION.map(p => `${p[0]}區／${p[1]}區`);
      const g = await pick(`③ ${now.getMonth() + 1}月是哪一組?`, "選「這個月」跑的那組", opts);
      if(g === null) return null;
      param = `回收車 輪值 ${RECYCLE_ROTATION[g][0]} ${now.getMonth() + 1}月`;
    }else{
      const zs = Array.from({ length: 17 }, (_, i) => `${i + 1}區`);
      const z = await pick("③ 選責任區", null, zs);
      if(z === null) return null;
      param = `回收車 ${z + 1}`;
    }
  }else{
    const zs = Array.from({ length: 17 }, (_, i) => `${i + 1}區`);
    const z = await pick("② 選責任區", null, zs);
    if(z === null) return null;
    param = `垃圾車 ${z + 1}`;
  }
  const sh = await pick("④ 你是哪一組配套?", "第三趟結束後會提醒明天上班時間", ["不用(只看三趟時間)", "休三六(星期日 06:45)", "休三六・守衛(星期日 10:00)", "休六日(星期三 09:45)"]);
  if(sh === null) return null;
  param += ["", " 休36", " 休36守衛", " 休6日"][sh];

  Pasteboard.copy(param);
  const done = new Alert();
  done.title = "✅ 已複製設定文字";
  done.message = `「${param}」\n\n接下來:長按主畫面(或鎖定畫面)的小工具 → 編輯小工具 → Script 選這個腳本 → 在 Parameter 欄位長按「貼上」。`;
  done.addAction("預覽看看");
  done.addCancelAction("好");
  const show = await done.presentAlert();
  return show === 0 ? param : "";
}

if(config.runsInWidget){
  Script.setWidget(await main());
}else{
  // 在 Scriptable 裡按 ▶:先跑設定精靈,選完可以預覽
  const param = await setupWizard();
  if(param){
    const w = await main(param);
    await w.presentMedium();
  }
}
Script.complete();
