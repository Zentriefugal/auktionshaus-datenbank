function evaluate(catalog,prices,fee,allowVendor){
  const byProduct=new Map();
  for(const r of catalog.rows){
    if(r.old||!r.out||!r.mat.length||!r.mat.every(([id,n])=>id>0&&n>0))continue;
    const id=r.out[0];if(!byProduct.has(id))byProduct.set(id,[]);byProduct.get(id).push(r);
  }
  function buy(id,n,path){
    const ah=prices.get(id),vendor=allowVendor&&catalog.vendor[id];
    let best=ah?{cost:n*ah,via:'AH',id,n}:null;
    if(vendor&&(!best||n*vendor<best.cost))best={cost:n*vendor,via:'Händler',id,n};
    const direct=best;
    if(path.has(id))return best;
    const more=new Set(path);more.add(id);
    for(const r of byProduct.get(id)||[]){
      const batches=Math.ceil(n/r.out[1]),parts=materials(r,batches,more);
      if(parts.every(p=>p.cost!=null)){
        const cost=parts.reduce((s,p)=>s+p.cost,0);
        const remainder=n%r.out[1];
        if(direct&&batches>1&&remainder){
          const bulk=materials(r,batches-1,more);
          const craftCost=bulk.some(p=>p.cost==null)?Infinity:bulk.reduce((s,p)=>s+p.cost,0);
          const rest={...direct,n:remainder,cost:direct.cost/n*remainder};
          if(!best||craftCost+rest.cost<best.cost){
            best={id,n,cost:craftCost+rest.cost,via:'Teilmenge zukaufen',parts:[
              {id,n:n-remainder,cost:craftCost,via:r.name,batches:batches-1,parts:bulk},rest]};
          }
        }
        if(!best||cost<best.cost)best={cost,via:r.name,id,n,batches,parts};
      }
    }
    return best;
  }
  function materials(r,batches,path){
    return r.mat.map(([id,qty])=>{const n=qty*batches;return buy(id,n,path)||{id,n,cost:null,via:'Preis fehlt'}});
  }
  return catalog.rows.map(r=>{
    if(r.old||!r.out||!r.mat.length)return {r,state:r.old?'Archivdatensatz':!r.out?'Kein AH-Produkt':'Materialdaten fehlen'};
    const parts=materials(r,1,new Set([r.out[0]]));
    const cost=parts.some(p=>p.cost==null)?null:parts.reduce((s,p)=>s+p.cost,0);
    const [id,n]=r.out,price=prices.get(id),net=price?Math.floor(price*n*(100-fee)/100+1e-8):null;
    const gain=net!=null&&cost!=null?net-cost:null;
    const minimum=cost!=null?Math.ceil(Math.ceil(cost)*100/(n*(100-fee))-1e-10):null;
    return {r,parts,cost,price,net,gain,minimum,state:gain==null?'Preis fehlt':gain>0?'Gewinn':gain<0?'Verlust':'Kostendeckend'};
  })
}
const $=id=>document.getElementById(id);
const jobs={Alchemy:'Alchemie',Blacksmithing:'Schmiedekunst',Engineering:'Ingenieurskunst',Enchanting:'Verzauberkunst',Leatherworking:'Lederverarbeitung',Tailoring:'Schneiderei',Mining:'Bergbau',Herbalism:'Kräuterkunde',Skinning:'Kürschnerei',Cooking:'Kochkunst','First Aid':'Erste Hilfe',Fishing:'Angeln',Poisons:'Gifte',Comprehension:'Schriftverständnis'};
let markets=new Map(),results=[],filtered=[],page=0,active=false,loadNumber=0;
const pageSize=50,items=catalog.items;
const item=id=>items[id]||'Gegenstand '+id;
const number=n=>n.toLocaleString('de-DE');
const silverNumber=new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
try{if(localStorage.getItem('marktchronik.currency')==='coins')$('currency').value='coins'}catch{}
function money(c){
  if(c==null)return '—';
  const rounded=Math.round(Math.abs(c)),sign=c<0&&rounded?'−':'';
  const value=el('span',null,'money'),labels=[];
  function coin(amount,kind,name){
    const icon=el('span',null,'coin '+kind);
    icon.setAttribute('aria-hidden','true');
    value.append(amount,icon);labels.push(amount+' '+name);
  }
  value.append(sign);
  if($('currency').value==='coins'){
    const gold=Math.floor(rounded/10000),silver=Math.floor(rounded/100)%100,copper=rounded%100;
    if(gold)coin(number(gold),'gold','Gold');
    if(silver)coin(number(silver),'silver','Silber');
    if(copper||!rounded)coin(number(copper),'copper','Kupfer');
  }else coin(silverNumber.format(rounded/100),'silver','Silber');
  value.setAttribute('role','img');value.setAttribute('aria-label',sign+labels.join(' '));value.title=sign+labels.join(' ');
  return value;
}
function el(tag,value,cls){const e=document.createElement(tag);if(value!=null)e.append(value);if(cls)e.className=cls;return e}
function priceLine(tag,label,c){const line=el(tag,label+' · ');line.append(money(c));return line}
function option(label,value){const node=el('option',label);node.value=value;return node}
function recalc(){
  const fee=$('fee').valueAsNumber;
  if(!Number.isFinite(fee)||fee<0||fee>99){results=[];refresh();$('stats').textContent='Bitte eine Gebühr zwischen 0 und 99 % eingeben.';return}
  results=evaluate(catalog,markets.get($('market').value)||new Map(),fee,$('vendor').checked);
  results.sort((a,b)=>(b.gain??-Infinity)-(a.gain??-Infinity)||a.r.name.localeCompare(b.r.name,'de'));refresh();
}
const skills=new Map();
function skillState(){
  const level=$('level').valueAsNumber,cap=$('cap').valueAsNumber;
  const valid=Number.isInteger(level)&&Number.isInteger(cap)&&level>=1&&level<=cap&&cap<=300;
  return {level,cap,valid,job:$('job').value};
}
function skillCheck(r,s){
  const enough=!r.old&&r.learn!=null&&s.level>=r.learn;
  const increase=enough&&r.grey!=null&&s.level<r.grey&&s.level<s.cap;
  return {enough,increase};
}
function skillText(r,s){
  if(r.old)return 'Archivdatensatz';
  if(r.learn==null)return 'Mindestfertigkeit unbekannt';
  const base='Ab '+r.learn;
  if(!s.valid)return base;
  if(s.level<r.learn)return base+' · Skill zu niedrig';
  if(s.level>=s.cap)return base+' · Ausbildungsgrenze erreicht';
  if(r.grey==null)return base+' · Punktchance unbekannt';
  if(s.level>=r.grey)return base+' · grau, kein Skillpunkt';
  if(r.yellow==null)return base+' · Skillpunkt möglich';
  const green=Math.ceil((r.yellow+r.grey)/2);
  return base+' · '+(s.level<r.yellow?'orange':s.level<green?'gelb':'grün')+' · Skillpunkt möglich';
}
function changeJob(){
  const job=$('job').value, saved=skills.get(job);
  $('skillbox').hidden=!job;
  $('level').value=saved?.level??'';$('cap').value=saved?.cap??'300';
  $('craft').checked=saved?.craft??false;$('up').checked=saved?.up??false;
  refresh();
}
function changeSkill(){
  skills.set($('job').value,{level:$('level').value,cap:$('cap').value,craft:$('craft').checked,up:$('up').checked});refresh();
}
function refresh(){
  const q=$('search').value.trim().toLowerCase();page=0;
  const s=skillState(), wantCraft=$('craft').checked, wantUp=$('up').checked;
  const skillFilter=!!s.job&&(wantCraft||wantUp);
  $('skillnote').textContent=!s.valid?'Gib eine ganze Fertigkeit von 1 bis zur Ausbildungsgrenze (maximal 300) ein.':'Der Skillfilter setzt ein erlerntes Rezept voraus. Unbekannte Mindeststufen werden bei aktiven Skillfiltern ausgeblendet.';
  if(s.valid&&s.level===s.cap)$('skillnote').textContent+=' Deine aktuelle Ausbildungsgrenze ist erreicht.';
  filtered=results.filter(({r,state})=>(!$('job').value||r.job===$('job').value)&&(!$('status').value||state===$('status').value)&&(!skillFilter||(s.valid&&skillCheck(r,s)[wantUp?'increase':'enough']))&&(!q||[r.id,r.name,r.en,r.out?.[0],r.out&&item(r.out[0])].join(' ').toLowerCase().includes(q)));
  $('stats').textContent=number(filtered.length)+' von '+number(catalog.rows.length)+' Einträgen';render();
}
function render(){
  const body=$('list');body.replaceChildren();
  for(const entry of filtered.slice(page*pageSize,(page+1)*pageSize)){
    const {r,cost,price,minimum,gain,state}=entry,row=el('tr'),name=el('td'),button=el('button',r.name,'recipe');button.onclick=()=>show(entry);
    name.append(button,el('small',$('job').value?skillText(r,skillState()):jobs[r.job]||r.job));row.append(name,el('td',r.out?.[1]??'—'),el('td',money(cost)),el('td',money(price)),el('td',money(minimum)),el('td',gain==null?state:money(gain),gain>0?'plus':gain<0?'minus':'muted'));body.append(row)
  }
  if(!body.children.length){const cell=el('td','Keine passenden Rezepte.');cell.colSpan=6;const row=el('tr');row.append(cell);body.append(row)}
  const total=Math.ceil(filtered.length/pageSize);$('pages').textContent=total?'Seite '+(page+1)+' von '+total:'0 Ergebnisse';$('back').disabled=page===0;$('next').disabled=page+1>=total;
}
function branch(parts){
  const ul=el('ul');
  for(const p of parts){const li=el('li',p.n+' × '+item(p.id)+' · '+(p.batches?p.batches+' × '+p.via:p.via)+' · ');li.append(money(p.cost));if(p.parts)li.append(branch(p.parts));ul.append(li)}
  return ul;
}
function show(e){
  const {r}=e,info=$('info');info.replaceChildren(el('small',(jobs[r.job]||r.job)+' · Rezept '+r.id),el('h2',r.name));
  info.append(el('p','Mindestfertigkeit · '+(r.learn??'unbekannt')+' / Gelb ab '+(r.yellow??'unbekannt')+' / Grau ab '+(r.grey??'unbekannt')));
  if($('job').value)info.append(el('p',skillText(r,skillState())));
  if(r.out)info.append(el('p','Ausbeute pro Herstellung · '+r.out[1]+' × '+item(r.out[0])));
  if(e.parts){info.append(el('strong','Beschaffung für eine Herstellung'),branch(e.parts),priceLine('p','Materialkosten',e.cost),e.price==null?el('p','Verkaufspreis im Scan fehlt.'):priceLine('p','AH-Preis (günstigste 5 %) pro Stück',e.price),priceLine('p','Erlös nach Gebühr',e.net),priceLine('strong','Gewinn',e.gain),priceLine('p','Kostendeckender Stückpreis',e.minimum))}
  else info.append(el('p',e.state));
  $('detail').showModal()
}
for(const job of [...new Set(catalog.rows.map(r=>r.job))].sort((a,b)=>jobs[a].localeCompare(jobs[b],'de'))) $('job').add(option(jobs[job],job));
$('job').value='';
for(const id of ['search','status'])$(id).oninput=refresh;
$('job').oninput=changeJob;
for(const id of ['level','cap','craft','up'])$(id).oninput=changeSkill;
for(const id of ['market','vendor','fee'])$(id).oninput=recalc;
$('back').onclick=()=>{page--;render()};$('next').onclick=()=>{page++;render()};$('close').onclick=()=>$('detail').close();
recalc();
