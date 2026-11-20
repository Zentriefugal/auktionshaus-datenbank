const groupKey=v=>JSON.stringify([v.region,v.market]);
const dateTime=t=>new Date(t*1000).toLocaleString('de-DE');
const regions={1:'Amerika',2:'Korea',3:'Europa',4:'Taiwan',5:'China'};
let allViews=[],marketViews=[],itemNames=new Map(),chosen=2835;
function refreshArchive(views){
  allViews=views.sort((a,b)=>a.timestamp-b.timestamp||a.key.localeCompare(b.key));
  const previous=$('market').value,groups=new Map();
  markets.clear();
  for(const v of allViews)groups.set(groupKey(v),v);
  $('market').replaceChildren(...[...groups].map(([k,v])=>option((regions[v.region]||v.region)+' · '+v.market,k)));
  $('market').value=groups.has(previous)?previous:(groups.keys().next().value||'');
  $('market').disabled=groups.size<2;
  for(const [k,v] of groups)markets.set(k,new Map(Object.entries(v.stats).map(([id,x])=>[+id,x[2]])));
  switchMarket();
}
function switchMarket(){
  marketViews=allViews.filter(v=>groupKey(v)===$('market').value);itemNames=new Map();
  for(const v of marketViews)for(const id of Object.keys(v.stats))itemNames.set(+id,catalog.items[id]||v.labels[id]||itemNames.get(+id)||'Gegenstand '+id);
  recalc();suggestItems();drawHistory();
}
function suggestItems(){
  const q=$('look').value.trim().toLocaleLowerCase('de'),matches=[];
  for(const [id,name] of itemNames){
    if(!q||String(id).includes(q)||name.toLocaleLowerCase('de').includes(q)){
      matches.push([id,name]);if(matches.length===100)break;
    }
  }
  $('choices').replaceChildren(...matches.map(([id,name])=>option(name,String(id))));
}
function choose(){
  const q=$('look').value.trim().toLocaleLowerCase('de');
  const exact=[...itemNames].filter(([,n])=>n.toLocaleLowerCase('de')===q);
  const id=/^\d+$/.test(q)?Number(q):exact.length===1?exact[0][0]:$('choices').options.length===1?Number($('choices').value):null;
  chosen=id;drawHistory();
}
const chartSeries=[
  {index:1,color:'#e5bf72',label:'Ø Gesamtangebot'},
  {index:2,color:'#8bdfae',label:'Ø günstigste 5%'}
];
function legendEntry(series){
  const entry=el('span'),dot=el('span','●');
  entry.style.display='inline-block';
  entry.style.marginRight='1.2em';
  dot.style.color=series.color;dot.setAttribute('aria-hidden','true');
  entry.append(dot,' '+series.label);return entry;
}
function curvePath(segment){
  if(segment.length<2)return '';
  const [[firstX,firstY]]=segment;
  let path='M '+firstX+' '+firstY;
  if(segment.length===2)return path+' L '+segment[1].join(' ');
  // Limit the tangent to both neighbouring slopes to avoid overshooting the observed prices.
  const slopes=segment.slice(1).map(([x,y],i)=>(y-segment[i][1])/(x-segment[i][0]));
  const tangents=segment.map((point,i)=>{
    if(i===0)return slopes[0];
    if(i===slopes.length)return slopes[i-1];
    const a=slopes[i-1],b=slopes[i];
    return a*b>0?Math.sign(a)*Math.min(Math.abs(a),Math.abs(b)):0;
  });
  for(let i=1;i<segment.length;i++){
    const [x0,y0]=segment[i-1],[x1,y1]=segment[i],dx=(x1-x0)/3;
    path+=' C '+[x0+dx,y0+tangents[i-1]*dx,x1-dx,y1-tangents[i]*dx,x1,y1].join(' ');
  }
  return path;
}
const axisFormats={
  day:new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}),
  week:new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}),
  month:new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}),
  year:new Intl.DateTimeFormat('de-DE',{month:'short'})
};
function timeTicks(start,end,span){
  const cursor=new Date(start*1000),ticks=[];
  cursor.setHours(0,0,0,0);
  while(cursor.getTime()/1000<=end){
    const t=cursor.getTime()/1000,hour=cursor.getHours(),monday=cursor.getDay()===1;
    let major,visible=true;
    if(span==='day')major=hour%6===0;
    else if(span==='week'){major=hour===0;visible=hour%6===0}
    else if(span==='month')major=monday;
    else{major=cursor.getDate()===1;visible=major||monday}
    if(t>=start&&visible)ticks.push({t,major,label:major?axisFormats[span].format(cursor):''});
    if(span==='day'||span==='week')cursor.setTime(cursor.getTime()+3600000);
    else cursor.setDate(cursor.getDate()+1);
  }
  return ticks;
}
function drawChart(points,start,end){
  const host=$('chart');host.replaceChildren();
  if(!points.some(p=>p.s))return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 840 195');svg.setAttribute('role','img');svg.setAttribute('aria-label','Stückpreise in Kupfer im Zeitverlauf');host.append(svg);
  function shape(tag,attrs,label){
    const node=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(label!=null)node.textContent=label;svg.append(node);return node;
  }
  let max=0;for(const p of points)if(p.s)max=Math.max(max,p.s[1],p.s[2]);
  const x=t=>end===start?435:76+730*(t-start)/(end-start),y=v=>145-117*v/(max||1);
  for(const tick of timeTicks(start,end,period)){
    const xx=x(tick.t);
    if(tick.major){
      shape('line',{x1:xx,x2:xx,y1:28,y2:145,stroke:'#344342','stroke-dasharray':'3 4'});
      shape('text',{x:xx,y:166,'text-anchor':'middle'},tick.label);
    }
    shape('line',{x1:xx,x2:xx,y1:145,y2:tick.major?153:149,stroke:tick.major?'#a6b3aa':'#6e827c'});
  }
  for(const fraction of [0,.5,1]){const v=fraction*max;shape('line',{x1:70,x2:813,y1:y(v),y2:y(v),stroke:'#3a4a49'});shape('text',{x:65,y:y(v)+4,'text-anchor':'end'},number(+v.toFixed(2)))}
  shape('text',{x:70,y:16},'Kupfer / Stück');
  for(const {index,color} of chartSeries){
    let segment=[];
    const paths=[],dots=[];
    for(const p of points){
      if(!p.s){paths.push(curvePath(segment));segment=[];continue}
      const point=[x(p.t),y(p.s[index])];
      if(segment.length&&point[0]<=segment.at(-1)[0]){paths.push(curvePath(segment));segment=[]}
      segment.push(point);dots.push(point);
    }
    paths.push(curvePath(segment));
    const d=paths.filter(Boolean).join(' ');
    if(d)shape('path',{d,fill:'none',stroke:color,'stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'});
    for(const [cx,cy] of dots)shape('circle',{cx,cy,r:3.6,fill:color});
  }
  shape('text',{x:75,y:191},dateTime(start));if(start!==end)shape('text',{x:813,y:191,'text-anchor':'end'},dateTime(end));
}
let period='week';
const periodTabs=[...document.querySelectorAll('.periods [role="tab"]')];
function setPeriod(button){
  period=button.dataset.period;
  for(const tab of periodTabs){
    tab.setAttribute('aria-selected',String(tab===button));tab.tabIndex=tab===button?0:-1;
  }
  $('chartPanel').setAttribute('aria-labelledby',button.id);
  drawHistory();
}
for(const [i,button] of periodTabs.entries()){
  button.onclick=()=>setPeriod(button);
  button.onkeydown=e=>{
    const destinations={Home:0,End:3,ArrowLeft:(i+3)%4,ArrowRight:(i+1)%4};
    if(!(e.key in destinations))return;
    e.preventDefault();const next=periodTabs[destinations[e.key]];setPeriod(next);next.focus();
  };
}
function rangeStart(end){
  if(period==='day'||period==='week')return end-(period==='day'?1:7)*86400;
  const date=new Date(end*1000),day=date.getUTCDate();
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-(period==='month'?1:12));
  const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,lastDay));return date.getTime()/1000;
}
function drawHistory(){
  const end=marketViews.at(-1)?.timestamp??0,start=rangeStart(end);
  const pts=marketViews.filter(v=>v.timestamp>=start).map(v=>({t:v.timestamp,s:v.stats[chosen]})),known=itemNames.has(chosen);
  $('histname').textContent=known?'['+chosen+'] '+itemNames.get(chosen):'Gegenstand auswählen';
  if(known)$('histnote').replaceChildren(...chartSeries.map(legendEntry));
  else $('histnote').textContent='Suche nach Name oder Item-ID und wähle einen Treffer.';
  drawChart(known?pts:[],start,end);
  if(known&&!pts.some(p=>p.s))$('chart').textContent='Für diesen Gegenstand gibt es im gewählten Zeitraum kein Angebot.';$('histrows').replaceChildren();
  if(!known)return;
  for(const p of pts.reverse()){
    const tr=el('tr');for(const v of [dateTime(p.t),p.s?number(p.s[0]):'Kein Angebot',p.s?number(p.s[3]):'—',money(p.s?.[1]),money(p.s?.[2])])tr.append(el('td',v));$('histrows').append(tr);
  }
}
$('look').oninput=()=>{suggestItems();choose()};$('choices').onchange=()=>{chosen=+$('choices').value;drawHistory()};
function tab(history){
  $('recipes').hidden=history;$('history').hidden=!history;
  for(const [id,selected] of [['recipesTab',!history],['historyTab',history]]){
    $(id).setAttribute('aria-selected',String(selected));$(id).tabIndex=selected?0:-1;
  }
}
$('recipesTab').onclick=()=>tab(false);$('historyTab').onclick=()=>tab(true);$('market').oninput=switchMarket;
for(const id of ['recipesTab','historyTab'])$(id).onkeydown=e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();const history=e.key==='Home'||(e.key!=='End'&&id==='recipesTab');
  tab(history);$(history?'historyTab':'recipesTab').focus();
};
let importQueue=Promise.resolve();
function enqueue(action){const job=importQueue.then(action);importQueue=job.catch(()=>{});return job}
async function loadFile(f){
  $('feedback').hidden=true;
  refreshArchive(await archiveRequest('import',{file:f.name,bytes:await f.arrayBuffer()}));
}
function fail(e){$('feedback').hidden=false;$('feedback').textContent='Vorgang fehlgeschlagen. '+e.message}
$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;
  $('file').disabled=true;try{await enqueue(()=>loadFile(f))}catch(err){fail(err)}finally{e.target.value='';$('file').disabled=false}
};
$('backup').onclick=async()=>{try{
  const bytes=await archiveRequest('backup'),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.sqlite3'}));
  const link=el('a');link.href=url;link.download='Marktchronik-Sicherung.sqlite';link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}catch(e){fail(e)}};
let watchTimer,watchHandle,lastRevision='';
async function checkWatched(){
  const handle=watchHandle;if(!handle)return;
  const f=await handle.getFile(),revision=f.lastModified+':'+f.size;
  if(lastRevision!==revision){await loadFile(f);lastRevision=revision}
}
function stopWatch(){clearInterval(watchTimer);watchHandle=null;lastRevision='';$('watch').textContent='Datei überwachen'}
$('watch').hidden=!window.showOpenFilePicker;
$('watch').onclick=async()=>{if(watchHandle){stopWatch();return}
  try{[watchHandle]=await window.showOpenFilePicker({multiple:false,types:[{description:'Marktchronik',accept:{'text/plain':['.lua']}}]});
    await enqueue(checkWatched);$('watch').textContent='Überwachung beenden';
    watchTimer=setInterval(()=>enqueue(checkWatched).catch(e=>{stopWatch();fail(e)}),60000);
  }catch(e){stopWatch();if(e.name!=='AbortError')fail(e)}
};
async function startArchive(){
  try{
    if(location.protocol==='file:')throw Error('Bitte die veröffentlichte GitHub-Pages-Adresse öffnen.');
    refreshArchive(await archiveRequest('views'));
    for(const id of ['file','watch','backup'])$(id).disabled=false;
    if(guildArchive){
      const response=await fetch(guildArchive,{cache:'no-cache'});
      if(!response.ok)throw Error('Das veröffentlichte Gildenarchiv konnte nicht geladen werden.');
      await enqueue(async()=>refreshArchive(await archiveRequest('import',{file:'gilde.sqlite',bytes:await response.arrayBuffer()})));
    }
  }catch(e){fail(e)}
}
const archiveReady=startArchive();
