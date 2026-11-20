importScripts('vendor/sql-wasm.js','schema.js','lua.js');
const engine=initSqlJs({locateFile:file=>new URL('vendor/'+file,self.location.href).href});
const cache=new Promise((resolve,reject)=>{
  const req=indexedDB.open('Marktchronik-SQLite:'+new URL('.',self.location.href).pathname,1);
  req.onupgradeneeded=()=>req.result.createObjectStore('archive');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function snapshot(){
  const cacheDB=await cache;
  return new Promise((resolve,reject)=>{
    const req=cacheDB.transaction('archive').objectStore('archive').get('current');
    req.onsuccess=()=>resolve(req.result||{revision:0});req.onerror=()=>reject(req.error);
  });
}
async function save(revision,bytes){
  const cacheDB=await cache;
  return new Promise((resolve,reject)=>{
    const tx=cacheDB.transaction('archive','readwrite'),store=tx.objectStore('archive'),req=store.get('current');
    req.onsuccess=()=>{if((req.result?.revision||0)!==revision){tx.abort();return}store.put({revision:revision+1,bytes},'current')};
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Archiv in einem weiteren Tab geändert. Bitte erneut importieren.'));
  });
}
function rows(db,sql,params=[]){
  const st=db.prepare(sql),result=[];
  try{st.bind(params);while(st.step())result.push(st.get())}finally{st.free()}
  return result;
}
function views(db){
  const map=new Map(rows(db,'SELECT id,region,market,timestamp,digest FROM scans').map(([id,region,market,timestamp,digest])=>[id,{key:digest+id,region,market,timestamp,labels:{},stats:{}}]));
  for(const [k,i,n,v,f,p,s] of rows(db,'SELECT scan_id,item_id,name,volume,full_price,five_price,stacks FROM prices')){
    const view=map.get(k);view.stats[i]=[v,f,p,s];if(n)view.labels[i]=n;
  }
  return [...map.values()];
}
function integer(x,min=0){
  if(!Number.isSafeInteger(x)||x<min)throw Error('Ungültiger Zahlenwert im Scan.');
  return x;
}
function group(packed){
  if(typeof packed!=='string')throw Error('Ungültige Stapeldaten.');
  const counts=new Map();
  for(const token of packed.split(',')){
    if(!/^[1-9]\d*:[1-9]\d*$/.test(token))throw Error('Ungültiger Stapel.');
    counts.set(token,(counts.get(token)||0)+1);
  }
  return [...counts].map(([key,c])=>[...key.split(':').map(Number),c]);
}
async function addScan(db,s,offers,labels){
  const {region,timestamp,market,auctions}=s;
  integer(region,1);integer(timestamp,1);integer(auctions);if(typeof market!=='string'||!market.trim()||timestamp>253402300799)throw Error('Ungültiger Markt oder Zeitpunkt.');
  let count=0;const canonical=[];
  const ids=Object.keys(offers).map(Number).sort((a,b)=>a-b);
  for(const id of ids){
    integer(id,1);const stacks=offers[id];stacks.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    for(const [q,p,c] of stacks){integer(q,1);integer(p,1);integer(c,1);count+=c;canonical.push(id+':'+q+':'+p+':'+c+';')}
  }
  if(count!==auctions)throw Error('Die Stapelanzahl stimmt nicht mit dem Scan überein.');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical.join('')));
  const digest=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  db.run('INSERT OR IGNORE INTO scans(region,market,timestamp,digest,auctions,bid_only,unreadable) VALUES(?,?,?,?,?,?,?)',[region,market,timestamp,digest,auctions,integer(s.bidOnly??0),integer(s.unreadable??0)]);
  if(!db.getRowsModified())return 0;
  const k=rows(db,'SELECT last_insert_rowid()')[0][0];
  const write=db.prepare('INSERT INTO offers VALUES(?,?,?,?,?)'),summary=db.prepare('INSERT INTO prices VALUES(?,?,?,?,?,?,?)');
  try{for(const id of ids){
    const stacks=offers[id];let volume=0,total=0,n=0;
    for(const [q,p,c] of stacks){volume+=q*c;total+=p*c;n+=c}
    integer(volume,1);integer(total,1);
    let left=volume,weighted=0;
    stacks.sort((a,b)=>a[1]/a[0]-b[1]/b[0]);
    for(const [q,p,c] of stacks){const take=Math.min(left,20*q*c);weighted+=take*(p/q);left-=take;if(!left)break}
    summary.run([k,id,labels[id]||null,volume,total/volume,weighted/volume,n]);
    for(const [q,p,c] of stacks)write.run([k,id,q,p,c]);
  }}finally{write.free();summary.free()}
  return 1;
}
async function merge(db,SQL,bytes,file){
  let added=0;
  if(new TextDecoder().decode(bytes.subarray(0,15))==='SQLite format 3'){
    const source=new SQL.Database(bytes);
    try{
      if(rows(source,'PRAGMA user_version')[0][0]!==1)throw Error('Unbekannte SQLite-Archivversion.');
      for(const [id,region,market,timestamp,auctions,bidOnly,unreadable] of rows(source,'SELECT id,region,market,timestamp,auctions,bid_only,unreadable FROM scans')){
        const offers={},labels=Object.fromEntries(rows(source,'SELECT item_id,name FROM prices WHERE scan_id=?',[id]));
        for(const [i,q,p,c] of rows(source,'SELECT item_id,quantity,stack_copper,copies FROM offers WHERE scan_id=?',[id]))(offers[i]??=[]).push([q,p,c]);
        added+=await addScan(db,{region,market,timestamp,auctions,bidOnly,unreadable},offers,labels);
      }
    }finally{source.close()}
  }else{
    const json=file.toLowerCase().endsWith('.json'),input=json?JSON.parse(new TextDecoder().decode(bytes)):readChronicle(bytes);
    if(json&&input.format!=='Marktchronik-Archiv-1')throw Error('Unbekannte JSON-Sicherung.');
    if(!Array.isArray(input.scans)||!input.names)throw Error('Archiv unvollständig.');
    for(const s of input.scans){const offers=Object.fromEntries(Object.entries(s.offers).map(([id,data])=>[id,group(data)]));added+=await addScan(db,s,offers,input.names)}
  }
  return added;
}
async function run(message){
  const SQL=await engine,record=await snapshot(),db=record.bytes?new SQL.Database(record.bytes):new SQL.Database();
  try{
    if(!record.bytes)db.run(schema);
    if(message.type==='backup')return db.export();
    if(message.type==='import'){
      db.run('BEGIN');
      try{const added=await merge(db,SQL,new Uint8Array(message.bytes),message.file);db.run('COMMIT');if(added)await save(record.revision,db.export())}
      catch(e){try{db.run('ROLLBACK')}catch{}throw e}
    }
    return views(db);
  }finally{db.close()}
}
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{try{self.postMessage({id:data.id,value:await run(data)})}catch(e){self.postMessage({id:data.id,error:e.message||String(e)})}})};
