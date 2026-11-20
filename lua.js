// Convert bytes to a binary string, preserving Lua's escaped and raw bytes.
function binary(bytes) {
  const pieces=[];
  for(let i=0;i<bytes.length;i+=16384) pieces.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  return pieces.join('');
}
const utf8=new TextDecoder();
function bytesOf(s){return Uint8Array.from(s,c=>c.charCodeAt(0))}
function readLua(bytes, label="AUCTIONATOR_PRICE_DATABASE") {
  const text=binary(bytes), start=new RegExp('^\\s*'+label+'\\s*=\\s*','m').exec(text);
  if(!start) throw Error('MARKTCHRONIK_DB fehlt. Bitte die Marktchronik.lua aus SavedVariables öffnen.');
  let pos=start.index+start[0].length;
  const atom=/[\w.+-]+/y;
  function space(){
    while(pos<text.length){
      if(/\s/.test(text[pos])){pos++;continue}
      if(text.startsWith('--',pos)){const nl=text.indexOf('\n',pos);pos=nl<0?text.length:nl+1;continue}
      break;
    }
  }
  function take(c){space();if(text[pos]!==c)throw Error('Unvollständige Lua-Tabelle.');pos++}
  function value(depth=0){
    if(depth>80)throw Error('Zu viele verschachtelte Tabellen.');
    space();const c=text[pos++];
    if(c==='{'){
      const result=Object.create(null);let ix=1;
      space();
      while(text[pos]!=='}'){
        let key,v;
        if(text[pos]==='['){pos++;key=value(depth+1);take(']');take('=');v=value(depth+1)}
        else {const first=value(depth+1);space();if(text[pos]==='='){pos++;key=first;v=value(depth+1)}else{key=ix++;v=first}}
        result[key]=v;space();if(text[pos]===','||text[pos]===';')pos++;space();
      } pos++;return result;
    }
    if(c==='"'||c==="'"){
      const pieces=[];let begin=pos;
      while(pos<text.length){
        const ch=text[pos++];if(ch===c){pieces.push(text.slice(begin,pos-1));return pieces.join('')}
        if(ch!=='\\')continue;
        pieces.push(text.slice(begin,pos-1));let esc=text[pos++];
        if(/[0-9]/.test(esc)){while(pos<text.length&&esc.length<3&&/\d/.test(text[pos]))esc+=text[pos++];pieces.push(String.fromCharCode(Number(esc)))}
        else if(esc==='x'){const h=text.slice(pos,pos+2);if(!/^[0-9a-f]{2}$/i.test(h))throw Error('Ungültiges Byte.');pieces.push(String.fromCharCode(parseInt(h,16)));pos+=2}
        else if(esc==='z'){while(pos<text.length&&/\s/.test(text[pos]))pos++}
        else{const escapes={a:'\x07',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v'};if(esc==='\r'&&text[pos]==='\n'){pos++;esc='\n'}pieces.push(escapes[esc]??esc)}
        begin=pos;
      }throw Error('Unvollständige Zeichenkette.');
    }
    atom.lastIndex=--pos;const m=atom.exec(text);if(!m)throw Error('Unerwarteter Wert in der Preisdatenbank.');
    pos=atom.lastIndex;return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(m[0])?Number(m[0]):m[0];
  }
  return value();
}
function readChronicle(bytes){
  const d=readLua(bytes,'MARKTCHRONIK_DB');
  if(d.version!==1||!d.scans||!d.names)throw Error('Unbekanntes Marktchronik-Format.');
  const decode=s=>utf8.decode(bytesOf(s));
  return {names:Object.fromEntries(Object.entries(d.names).map(([id,name])=>[id,decode(name)])),scans:Object.values(d.scans).map(s=>({...s,market:decode(s.market)}))};
}

