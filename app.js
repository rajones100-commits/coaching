const CFG = window.COACHING_CONFIG || {};
const fmtMoney = n => new Intl.NumberFormat(CFG.locale || 'en-GB',{style:'currency',currency:CFG.currency||'GBP',maximumFractionDigits:0}).format(Number(n||0));
const toISO = d => { const x=new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
const now = new Date();

function plusDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function mondayOf(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x}
function inRange(date,start,end){const d=new Date(date+'T12:00:00');return d>=start&&d<=end}
function monthKey(d){return String(new Date(d+'T12:00:00').getMonth()+1).padStart(2,'0')}
function cleanMoney(v){return Number(String(v??'').replace(/[^0-9.-]/g,''))||0}
function normaliseDate(v){const s=String(v??'').trim();if(!s)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);if(m){let y=m[3];if(y.length===2)y='20'+y;return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}const d=new Date(s);return Number.isNaN(d.getTime())?'':toISO(d)}
function normaliseTime(v){const s=String(v??'').trim();if(!s)return'';let m=s.match(/(\d{1,2}):(\d{2})/);if(m)return `${m[1].padStart(2,'0')}:${m[2]}`;m=s.match(/^(\d{1,2})(?:\.(\d{2}))?\s*(am|pm)$/i);if(m){let h=Number(m[1]);if(m[3].toLowerCase()==='pm'&&h<12)h+=12;if(m[3].toLowerCase()==='am'&&h===12)h=0;return `${String(h).padStart(2,'0')}:${m[2]||'00'}`;}return s}
function yes(v){const s=String(v??'').trim().toLowerCase();return v===true||['yes','y','true','paid','1','✓','✔','paid in full'].includes(s)}
function normKey(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function pick(row, aliases){const map={};Object.keys(row).forEach(k=>map[normKey(k)]=row[k]);for(const a of aliases){const k=normKey(a);if(map[k]!==undefined&&String(map[k]).trim()!=='')return map[k]}return''}

function parseCSV(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(c==='"'&&quoted&&n==='"'){field+='"';i++;}
    else if(c==='"'){quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(field);if(row.some(x=>x!==''))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field.length||row.length){row.push(field);if(row.some(x=>x!==''))rows.push(row)}
  if(!rows.length)return[];
  const headers=rows[0].map(h=>h.trim());
  return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??'').trim()]))).filter(r=>Object.values(r).some(Boolean));
}

function rowsToData(rows){
  const bookings=rows.map((r,i)=>({
    id:String(pick(r,['Booking ID','ID','Session ID'])||`b${i+1}`),
    date:normaliseDate(pick(r,['Date','Session Date','Coaching Date','Day'])),
    start:normaliseTime(pick(r,['Start Time','Time','Start','Session Time'])),
    end:normaliseTime(pick(r,['End Time','End','Finish Time','Finish'])),
    player:String(pick(r,['Player','Player Name','Name','Client','Cricketer'])),
    type:String(pick(r,['Session Type','Type','Coaching Type','Session'])||'Coaching'),
    fee:cleanMoney(pick(r,['Fee','Price','Cost','Amount','Charge','Session Fee'])),
    paid:yes(pick(r,['Paid?','Paid','Payment Status','Status','Payment'])),
    paymentMethod:String(pick(r,['Payment Method','Method','Paid By'])),
    focus:String(pick(r,['Session Focus','Focus','Coaching Focus','Skill','Topic'])),
    notes:String(pick(r,['Notes','Coaching Notes','Session Notes','Comments','Observations','Feedback','Next Session']))
  })).filter(b=>b.date||b.player);

  const byPlayer=new Map();
  bookings.forEach(b=>{
    const names=b.player.split(/\s*&\s*|\s+and\s+|\s*,\s*/i).filter(Boolean);
    names.forEach(name=>{
      const key=name.trim().toLowerCase();if(!key)return;
      if(!byPlayer.has(key))byPlayer.set(key,{id:'p'+(byPlayer.size+1),name:name.trim(),ageGroup:'',batting:'',bowling:'',contact:'',notes:[]});
      if(b.notes||b.focus)byPlayer.get(key).notes.push({date:b.date,text:[b.focus&&`Focus: ${b.focus}`,b.notes].filter(Boolean).join(' · ')});
    });
  });
  rows.forEach(r=>{
    const name=String(pick(r,['Player','Player Name','Name','Client','Cricketer'])).trim();if(!name)return;
    const key=name.toLowerCase();if(!byPlayer.has(key))return;const p=byPlayer.get(key);
    p.ageGroup ||= String(pick(r,['Age Group','Age','Team']));
    p.batting ||= String(pick(r,['Batting','Batting Style','Bats']));
    p.bowling ||= String(pick(r,['Bowling','Bowling Style','Bowls']));
    p.contact ||= [pick(r,['Parent / Guardian','Parent','Guardian']),pick(r,['Phone','Mobile']),pick(r,['Email'])].filter(Boolean).join(' · ');
  });
  const players=[...byPlayer.values()].map(p=>({...p,notes:p.notes.sort((a,b)=>(b.date||'').localeCompare(a.date||''))}));
  return {bookings,players};
}

async function loadData(){
  if(!CFG.csvUrl)throw new Error('No CSV URL set');
  const res=await fetch(CFG.csvUrl,{cache:'no-store'});
  if(!res.ok)throw new Error(`Spreadsheet returned ${res.status}`);
  const text=await res.text();
  if(/<html|<!doctype/i.test(text))throw new Error('Google returned a webpage instead of CSV');
  return rowsToData(parseCSV(text));
}

let DATA={bookings:[],players:[]};
function render(){
  const today=toISO(now),monday=mondayOf(now),sunday=plusDays(monday,6);
  document.getElementById('todayLabel').textContent=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('dayHeading').textContent=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
  const day=DATA.bookings.filter(b=>b.date===today).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  const sum=a=>a.reduce((t,b)=>t+Number(b.fee||0),0);
  document.getElementById('todaySessions').textContent=day.length;document.getElementById('todayBooked').textContent=fmtMoney(sum(day));document.getElementById('todayPaid').textContent=fmtMoney(sum(day.filter(b=>b.paid)));document.getElementById('todayOutstanding').textContent=fmtMoney(sum(day.filter(b=>!b.paid)));document.getElementById('dayBookings').innerHTML=day.length?day.map(bookingHTML).join(''):'<div class="empty">No coaching appointments today.</div>';
  const week=DATA.bookings.filter(b=>inRange(b.date,monday,sunday)).sort((a,b)=>(a.date+(a.start||'')).localeCompare(b.date+(b.start||'')));
  document.getElementById('weekSummary').innerHTML=`<div class="summary-chip"><span>Sessions</span><strong>${week.length}</strong></div><div class="summary-chip"><span>Booked</span><strong>${fmtMoney(sum(week))}</strong></div><div class="summary-chip"><span>Outstanding</span><strong>${fmtMoney(sum(week.filter(b=>!b.paid)))}</strong></div>`;
  document.getElementById('weekBookings').innerHTML=[0,1,2,3,4,5,6].map(i=>{const d=plusDays(monday,i),iso=toISO(d),items=week.filter(b=>b.date===iso);return `<div class="day-block"><h3>${d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</h3>${items.length?items.map(bookingHTML).join(''):'<div class="empty">No sessions</div>'}</div>`}).join('');
  renderPlayers(DATA.players);
  const year=now.getFullYear(),month=now.getMonth();const monthData=DATA.bookings.filter(b=>{const d=new Date(b.date+'T12:00:00');return d.getFullYear()===year&&d.getMonth()===month}),yearData=DATA.bookings.filter(b=>new Date(b.date+'T12:00:00').getFullYear()===year);
  setMoney('weekIncome','weekPaid',week);setMoney('monthIncome','monthPaid',monthData);setMoney('yearIncome','yearPaid',yearData);document.getElementById('allOutstanding').textContent=fmtMoney(sum(DATA.bookings.filter(b=>!b.paid)));renderBars(yearData);
}
function bookingHTML(b){return `<article class="booking"><div class="time">${b.start||'—'}</div><div><h3>${b.player||'Unnamed player'}</h3><div class="meta">${b.type||'Coaching'}${b.focus?' · '+b.focus:''}</div></div><div class="fee"><strong>${fmtMoney(b.fee)}</strong><span class="badge ${b.paid?'paid':'unpaid'}">${b.paid?'PAID':'NOT PAID'}</span></div></article>`}
function setMoney(main,sub,arr){const total=arr.reduce((t,b)=>t+Number(b.fee||0),0),paid=arr.filter(b=>b.paid).reduce((t,b)=>t+Number(b.fee||0),0);document.getElementById(main).textContent=fmtMoney(total);document.getElementById(sub).textContent=`${fmtMoney(paid)} paid`}
function renderPlayers(players){const term=(document.getElementById('playerSearch').value||'').toLowerCase();const list=players.filter(p=>p.name.toLowerCase().includes(term));document.getElementById('playersList').innerHTML=list.map(p=>`<article class="player-card" data-id="${p.id}"><h3>${p.name}</h3><p>${p.ageGroup||''}</p><p>${p.batting||''}${p.bowling?' · '+p.bowling:''}</p><p>${(p.notes||[]).length} coaching note${(p.notes||[]).length===1?'':'s'}</p></article>`).join('')||'<div class="empty">No players found.</div>';document.querySelectorAll('.player-card').forEach(el=>el.onclick=()=>openPlayer(el.dataset.id))}
function openPlayer(id){const p=DATA.players.find(x=>x.id===id);if(!p)return;const sessions=DATA.bookings.filter(b=>b.player.toLowerCase().includes(p.name.toLowerCase()));document.getElementById('playerModalContent').innerHTML=`<p class="eyebrow">PLAYER PROFILE</p><h2>${p.name}</h2><p>${[p.ageGroup,p.batting,p.bowling].filter(Boolean).join(' · ')}</p><p>${p.contact||''}</p><p><strong>${sessions.length}</strong> sessions in database</p><h3>Coaching notes</h3>${(p.notes||[]).map(n=>`<div class="note"><small>${n.date?new Date(n.date+'T12:00:00').toLocaleDateString('en-GB'):''}</small><div>${n.text}</div></div>`).join('')||'<div class="empty">No notes yet.</div>'}`;document.getElementById('playerModal').classList.add('open')}
function renderBars(yearData){const totals=Array(12).fill(0);yearData.forEach(b=>totals[Number(monthKey(b.date))-1]+=Number(b.fee||0));const max=Math.max(...totals,1),labels=['J','F','M','A','M','J','J','A','S','O','N','D'];document.getElementById('incomeBars').innerHTML=totals.map((v,i)=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(3,v/max*175)}px"><span class="bar-value">${v?fmtMoney(v):''}</span></div>${labels[i]}</div>`).join('')}

document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));btn.classList.add('active');document.getElementById(btn.dataset.view+'View').classList.add('active')});
document.getElementById('playerSearch').addEventListener('input',()=>renderPlayers(DATA.players));document.getElementById('closeModal').onclick=()=>document.getElementById('playerModal').classList.remove('open');document.getElementById('playerModal').onclick=e=>{if(e.target.id==='playerModal')e.currentTarget.classList.remove('open')};document.getElementById('refreshBtn').onclick=async()=>{try{DATA=await loadData();render();}catch(e){showError(e)}};
function showError(err){console.error(err);document.getElementById('dayBookings').innerHTML=`<div class="empty"><strong>Spreadsheet could not be loaded.</strong><br>${String(err.message||err)}</div>`;}
loadData().then(d=>{DATA=d;render()}).catch(showError);
