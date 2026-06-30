# index.html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>路線時間查詢</title>
<style>
  :root{
    --bg:#1b1f1a;
    --panel:#242a22;
    --accent:#9bd13b;
    --accent-dim:#5d7a2c;
    --text:#eef0e8;
    --text-dim:#a9b29c;
    --line:#3a4233;
  }
  *{box-sizing:border-box;}
  body{
    margin:0;
    background:var(--bg);
    color:var(--text);
    font-family:"PingFang TC","Noto Sans TC",-apple-system,sans-serif;
    min-height:100vh;
    display:flex;
    flex-direction:column;
    align-items:center;
    padding:32px 16px 60px;
  }
  h1{
    font-size:22px;
    letter-spacing:2px;
    margin:0 0 4px;
    color:var(--accent);
    font-weight:700;
  }
  .sub{
    color:var(--text-dim);
    font-size:13px;
    margin-bottom:28px;
    letter-spacing:1px;
  }
  .tabs{
    width:100%;
    max-width:420px;
    display:flex;
    gap:8px;
    margin-bottom:20px;
  }
  .tab-btn{
    flex:1;
    background:transparent;
    border:1px solid var(--line);
    color:var(--text-dim);
    border-radius:10px;
    padding:10px 0;
    font-size:14px;
    font-weight:600;
    cursor:pointer;
    transition:all .15s ease;
  }
  .tab-btn.active{
    background:var(--accent-dim);
    color:var(--text);
    border-color:var(--accent);
  }
  .picker{
    width:100%;
    max-width:420px;
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:8px;
    margin-bottom:24px;
  }
  .route-btn{
    background:var(--panel);
    border:1px solid var(--line);
    color:var(--text);
    border-radius:10px;
    padding:14px 0;
    font-size:18px;
    font-weight:600;
    cursor:pointer;
    transition:all .15s ease;
  }
  .route-btn:active{transform:scale(0.96);}
  .route-btn.active{
    background:var(--accent);
    color:#1b1f1a;
    border-color:var(--accent);
  }
  .card{
    width:100%;
    max-width:420px;
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:20px;
    display:none;
  }
  .card.show{display:block;animation:fade .2s ease;}
  @keyframes fade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
  .card-title{
    font-size:15px;
    color:var(--accent);
    letter-spacing:1px;
    margin-bottom:14px;
    border-bottom:1px solid var(--line);
    padding-bottom:10px;
  }
  .trip{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:12px 0;
    border-bottom:1px solid var(--line);
  }
  .trip:last-child{border-bottom:none;}
  .trip-label{
    font-size:13px;
    color:var(--text-dim);
    width:54px;
  }
  .time-pair{
    display:flex;
    align-items:center;
    gap:10px;
    font-size:18px;
    font-weight:600;
    font-variant-numeric:tabular-nums;
  }
  .arrow{color:var(--text-dim);font-size:14px;}
  .depart{color:var(--text);}
  .arrive{color:var(--accent);}
  .note{
    font-size:12px;
    color:#e6a23c;
    margin-top:2px;
  }
  .buckets{
    display:flex;
    gap:6px;
    margin-top:6px;
  }
  .bucket-chip{
    display:flex;
    align-items:center;
    gap:4px;
    font-size:12px;
    color:var(--text-dim);
    background:#1b1f1a;
    border:1px solid var(--line);
    border-radius:20px;
    padding:3px 8px;
  }
  .bucket-dot{
    width:9px;
    height:9px;
    border-radius:50%;
    display:inline-block;
  }
  .location{
    font-size:12px;
    color:var(--text-dim);
    margin-top:4px;
    display:flex;
    align-items:center;
    gap:5px;
  }
  .loc-group{
    margin-top:10px;
    padding-top:8px;
    border-top:1px dashed var(--line);
  }
  .loc-group-title{
    font-size:11px;
    color:var(--accent);
    letter-spacing:1px;
    margin-bottom:4px;
    font-weight:600;
  }
  .location{
    cursor:pointer;
  }
  .location:active{
    opacity:0.6;
  }
  .modal-overlay{
    display:none;
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.6);
    align-items:center;
    justify-content:center;
    z-index:50;
    padding:20px;
  }
  .modal-overlay.show{
    display:flex;
  }
  .modal-box{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:16px;
    max-width:360px;
    width:100%;
  }
  .modal-title{
    font-size:14px;
    color:var(--accent);
    margin-bottom:10px;
    text-align:center;
  }
  .modal-box img{
    width:100%;
    border-radius:10px;
    display:block;
  }
  .modal-close{
    width:100%;
    margin-top:14px;
    padding:10px 0;
    background:var(--accent-dim);
    color:var(--text);
    border:none;
    border-radius:10px;
    font-size:14px;
    cursor:pointer;
  }
  .legend{
    margin-top:14px;
    font-size:11px;
    color:var(--text-dim);
    display:flex;
    gap:16px;
  }
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;}
  .placeholder{
    color:var(--text-dim);
    font-size:13px;
    margin-top:8px;
  }
  .addr-row{
    display:flex;
    align-items:center;
    gap:14px;
    padding:16px 0;
    border-bottom:1px solid var(--line);
    font-size:25px;
    cursor:pointer;
  }
  .addr-row:last-child{border-bottom:none;}
  .addr-row:active{opacity:0.7;}
  .addr-check{
    flex-shrink:0;
    width:40px;
    height:40px;
    border-radius:50%;
    background:var(--accent-dim);
    color:var(--text);
    font-size:19px;
    font-weight:600;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:all .15s ease;
  }
  .addr-text{color:var(--text);transition:all .15s ease;}
  .addr-hint{
    font-size:15px;
    color:var(--text-dim);
    line-height:1.5;
    margin-bottom:14px;
    padding-bottom:12px;
    border-bottom:1px dashed var(--line);
  }
  .reset-bar{
    display:flex;
    justify-content:flex-end;
    margin-bottom:8px;
  }
  .reset-btn{
    background:transparent;
    border:1px solid var(--line);
    color:var(--text-dim);
    border-radius:24px;
    padding:10px 20px;
    font-size:16px;
    cursor:pointer;
  }
  .reset-btn:active{opacity:0.6;}
  .addr-row.done .addr-check{
    background:var(--accent);
    color:#1b1f1a;
  }
  .addr-row.done .addr-text{
    color:var(--text-dim);
    text-decoration:line-through;
  }
</style>
</head>
<body>

  <h1>路線時間查詢</h1>
  <div class="sub">選擇車輛類型與編號 · 查看三趟時間</div>

  <div class="tabs" id="tabs"></div>

  <div class="picker" id="picker"></div>

  <div id="empty" class="placeholder">↑ 請選擇路線編號</div>

  <div class="card" id="card">
    <div class="card-title" id="cardTitle">路線</div>
    <div id="trips"></div>
    <div class="legend" id="legendBox">
      <span><span class="dot" style="background:var(--text)"></span>出發</span>
      <span><span class="dot" style="background:var(--accent)"></span>到達</span>
    </div>
  </div>

  <div class="modal-overlay" id="modalOverlay" onclick="closeImg()">
    <div class="modal-box" onclick="event.stopPropagation()">
      <div class="modal-title" id="modalTitle">位置</div>
      <img id="modalImg" src="" alt="位置照片">
      <button class="modal-close" onclick="closeImg()">關閉</button>
    </div>
  </div>

<script>
// 垃圾車 / 回收車共用: route -> [ [depart, arrive, note?], ... 三趟 ]
const truckData = {
  "1":  [["15:50","16:09"], ["18:15","18:37"], ["20:25","20:45"]],
  "5":  [["15:35","15:50"], ["18:00","18:33"], ["20:35","20:50"]],
  "2":  [["15:48","16:05"], ["18:10","18:31"], ["20:20","20:37"]],
  "6":  [["15:35","15:55"], ["18:10","18:30"], ["20:30","20:48"]],
  "3":  [["15:45","16:00"], ["18:15","18:35"], ["20:20","20:45"]],
  "7":  [["15:35","15:54"], ["18:05","18:24"], ["20:35","20:53"]],
  "4":  [["15:35","16:02"], ["18:23","18:39"], ["20:40","20:59"]],
  "8":  [["15:35","16:00"], ["18:15","18:20"], ["20:25","20:44"]],
  "9":  [["15:50","16:08"], ["17:55",""],      ["20:42","20:54"]],
  "13": [["15:58","16:05"], ["18:23","18:30"], ["20:46","20:50","出發時跟車出門"]],
  "10": [["15:45","16:05"], ["18:09","18:30"], ["20:44","20:55"]],
  "14": [["15:38","15:55"], ["18:29","18:35"], ["20:45","20:53"]],
  "11": [["15:41","16:05"], ["18:14","18:33"], ["20:43","21:00"]],
  "15": [["15:45","15:55"], ["18:16","18:25"], ["20:34","20:45"]],
  "12": [["15:35","15:53"], ["18:15","18:28"], ["20:33","20:40","出發時跟車出門"]],
  "16": [["15:55","16:00"], ["18:27","18:35","出發時跟車出門"], ["20:40","20:50"]],
};
const truckOrder = ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16"];

// 廚餘車: 區域 -> [第一車, 第二車, 第三車] (單一時間,無到達時間)
const kitchenData = {
  "草衙": ["16:15","19:00","21:15"],
  "離子內": ["16:20","19:00","21:15"],
  "西甲": ["15:15","19:00","21:15"],
};
const kitchenOrder = ["草衙","離子內","西甲"];

// 配套路線: 路線名稱 -> 地址陣列(順序清單,非時間)
const addressData = {
  "回1": [],
  "回2": [],
  "輪1": [],
  "輪2": [
    "離子內路166號","和平二路84號","英明一路48號","英明一路79號","英明一路129號",
    "英德街100號","廣西路47號","廣西路31號","和平二路281號","二聖一路13號",
    "二聖路299號 天之道","瑞祥街138號","瑞恩街130號","精忠街149號","精忠街29號",
    "瑞北路191號","武慶二路41號","武慶二路31號","瑞和街220號","瑞隆路545號",
    "瑞隆路435號","崗山西街48號","公正路28號","武慶一路60號","瑞隆路212號",
    "永豐路136號","永豐路182號","武營路47巷46號","瑞福路148號","瑞福路170號",
    "瑞北路82號","公正路241號","公正路169號","瑞隆路412號","瑞隆路408號","瑞春街71號",
  ],
  "1999": [],
  "西配": [],
  "籬配": [],
  "草配": [],
};
const wedOrder = ["回1","回2","輪1","輪2"];
const sunOrder = ["1999","西配","籬配","草配"];

const categories = {
  "垃圾車": { type:"truck", data: truckData, order: truckOrder },
  "回收車": { type:"truck", data: truckData, order: truckOrder },
  "廚餘車": { type:"kitchen", data: kitchenData, order: kitchenOrder },
  "星期三配套": { type:"address", data: addressData, order: wedOrder },
  "星期日配套": { type:"address", data: addressData, order: sunOrder },
};

let currentCategory = "垃圾車";

const tabsEl = document.getElementById('tabs');
Object.keys(categories).forEach(cat=>{
  const tab = document.createElement('button');
  tab.className = 'tab-btn';
  tab.textContent = cat;
  tab.onclick = ()=> selectCategory(cat, tab);
  tabsEl.appendChild(tab);
});
tabsEl.firstChild.classList.add('active');

function selectCategory(cat, btn){
  currentCategory = cat;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('card').classList.remove('show');
  document.getElementById('empty').style.display = 'block';
  renderPicker();
}

function renderPicker(){
  const cfg = categories[currentCategory];
  const picker = document.getElementById('picker');
  picker.innerHTML = '';
  cfg.order.forEach(r=>{
    const btn = document.createElement('button');
    btn.className = 'route-btn';
    btn.textContent = r;
    btn.onclick = ()=> selectItem(r, btn);
    picker.appendChild(btn);
  });
}

function selectItem(key, btn){
  document.querySelectorAll('.route-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('empty').style.display = 'none';

  const card = document.getElementById('card');
  card.classList.add('show');

  const cfg = categories[currentCategory];
  const isRoute = cfg.order === truckOrder;
  const titlePrefix = cfg.type === 'address' ? '路線 ' : (isRoute ? '路線 ' : '區域 ');
  document.getElementById('cardTitle').textContent =
    titlePrefix + key + '　·　' + currentCategory;

  const tripsEl = document.getElementById('trips');
  tripsEl.innerHTML = '';
  const labels = ['第一趟','第二趟','第三趟'];
  const legend = document.getElementById('legendBox');

  if(cfg.type === 'address'){
    legend.style.display = 'none';
    const list = cfg.data[key];
    if(!list || list.length === 0){
      tripsEl.innerHTML = `<div class="placeholder" style="margin:0;">尚無地址資料</div>`;
    } else {
      const hint = document.createElement('div');
      hint.className = 'addr-hint';
      hint.textContent = '點選地址即可標記已收取,再點一次可取消';
      tripsEl.appendChild(hint);

      const resetBar = document.createElement('div');
      resetBar.className = 'reset-bar';
      resetBar.innerHTML = `<button class="reset-btn">↺ 一鍵全恢復</button>`;
      resetBar.querySelector('.reset-btn').onclick = ()=>{
        tripsEl.querySelectorAll('.addr-row.done').forEach(row=>{
          row.classList.remove('done');
          const idx = Array.from(tripsEl.querySelectorAll('.addr-row')).indexOf(row);
          row.querySelector('.addr-check').textContent = String(idx+1);
        });
      };
      tripsEl.appendChild(resetBar);

      list.forEach((addr, i)=>{
        const row = document.createElement('div');
        row.className = 'addr-row';
        row.innerHTML = `<span class="addr-check">${i+1}</span><span class="addr-text">${addr}</span>`;
        const checkEl = row.querySelector('.addr-check');
        row.onclick = ()=>{
          row.classList.toggle('done');
          checkEl.textContent = row.classList.contains('done') ? '✓' : String(i+1);
        };
        tripsEl.appendChild(row);
      });
    }
  } else if(cfg.type === 'truck'){
    legend.style.display = 'flex';
    cfg.data[key].forEach((t, i)=>{
      const [dep, arr, note] = t;
      const row = document.createElement('div');
      row.className = 'trip';
      row.innerHTML = `
        <div class="trip-label">${labels[i]}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;">
          <div class="time-pair">
            <span class="depart">${dep || '—'}</span>
            <span class="arrow">→</span>
            <span class="arrive">${arr || '—'}</span>
          </div>
          ${currentCategory === '垃圾車' ? `
          <div class="buckets">
            <span class="bucket-chip"><span class="bucket-dot" style="background:#5ba93c"></span>×2</span>
            <span class="bucket-chip"><span class="bucket-dot" style="background:#8a8f86"></span>×2</span>
          </div>
          <div class="loc-group">
            <div class="loc-group-title">下廚餘桶位置</div>
            <div class="location" onclick="showImg('中山路 88 號前','https://picsum.photos/seed/loc1/500/350')"><span class="bucket-dot" style="background:#3ca953"></span> 中山路 88 號前</div>
            <div class="location" onclick="showImg('民生路 12 巷口','https://picsum.photos/seed/loc2/500/350')"><span class="bucket-dot" style="background:#8a8f86"></span> 民生路 12 巷口</div>
          </div>
          <div class="loc-group">
            <div class="loc-group-title">給民眾廚餘桶位置</div>
            <div class="location" onclick="showImg('和平公園入口','https://picsum.photos/seed/loc3/500/350')"><span class="bucket-dot" style="background:#3ca953"></span> 和平公園入口</div>
            <div class="location" onclick="showImg('福德宮廟埕','https://picsum.photos/seed/loc4/500/350')"><span class="bucket-dot" style="background:#8a8f86"></span> 福德宮廟埕</div>
          </div>` : ''}
          ${note ? `<div class="note">${note}</div>` : ''}
        </div>
      `;
      tripsEl.appendChild(row);
    });
  } else {
    legend.style.display = 'none';
    cfg.data[key].forEach((time, i)=>{
      const row = document.createElement('div');
      row.className = 'trip';
      row.innerHTML = `
        <div class="trip-label">${labels[i]}</div>
        <div class="time-pair"><span class="depart">${time || '—'}</span></div>
      `;
      tripsEl.appendChild(row);
    });
  }
}

renderPicker();

function showImg(title, url){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalImg').src = url;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeImg(){
  document.getElementById('modalOverlay').classList.remove('show');
}
</script>
</body>
</html>
