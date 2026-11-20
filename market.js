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
function drawChart(points,start,end){
  const host=$('chart');host.replaceChildren();
  if(!points.some(p=>p.s))return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 840 195');svg.setAttribute('role','img');svg.setAttribute('aria-label','Stückpreise in Kupfer im Zeitverlauf');host.append(svg);
  function shape(tag,attrs,label){
    const node=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(label!=null)node.textContent=label;svg.append(node);return node;
  }
  let max=0;for(const p of points)if(p.s)max=Math.max(max,p.s[1],p.s[2]);
  const x=t=>end===start?435:76+730*(t-start)/(end-start),y=v=>145-117*v/(max||1);
  for(const fraction of [0,.5,1]){const v=fraction*max;shape('line',{x1:70,x2:813,y1:y(v),y2:y(v),stroke:'#3a4a49'});shape('text',{x:65,y:y(v)+4,'text-anchor':'end'},number(+v.toFixed(2)))}
  shape('text',{x:70,y:16},'Kupfer / Stück');
  for(const [idx,color] of [[1,'#e5bf72'],[2,'#8bdfae']]){
    let path='',connected=false;
    for(const p of points){
      if(!p.s){connected=false;continue}
      const xx=x(p.t),yy=y(p.s[idx]);path+=(connected?' L':' M')+xx+' '+yy;connected=true;
      shape('circle',{cx:xx,cy:yy,r:3.6,fill:color});
    }
    shape('path',{d:path,fill:'none',stroke:color,'stroke-width':2});
  }
  shape('text',{x:75,y:178},dateTime(start));if(start!==end)shape('text',{x:813,y:178,'text-anchor':'end'},dateTime(end));
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
  $('histnote').textContent=known?'Gold: Ø Gesamtangebot · Grün: Ø günstigste 5 % des Volumens.':'Suche nach Name oder Item-ID und wähle einen Treffer.';
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
  e.preventDefault();const history=e.key==='End'||(e.key!=='Home'&&id==='recipesTab');
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
