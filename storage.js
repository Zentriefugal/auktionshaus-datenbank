let storageWorker,requestID=0;
const pending=new Map();
function archiveRequest(type,extra={}){
  if(!storageWorker){
    storageWorker=new Worker('./archive-worker.js');
    storageWorker.onmessage=({data})=>{
      const job=pending.get(data.id);if(!job)return;
      pending.delete(data.id);if(data.error)job.reject(Error(data.error));else job.resolve(data.value);
    };
    storageWorker.onerror=()=>{for(const job of pending.values())job.reject(Error('SQLite konnte nicht geladen werden. Prüfe, ob alle Dateien auf GitHub Pages liegen.'));pending.clear();storageWorker.terminate();storageWorker=null};
  }
  return new Promise((resolve,reject)=>{const id=++requestID;pending.set(id,{resolve,reject});storageWorker.postMessage({id,type,...extra},extra.bytes?[extra.bytes]:[])});
}
