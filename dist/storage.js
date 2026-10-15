'use strict';
const replayStore={
 async open(){
  return new Promise((resolve,reject)=>{
   if(!globalThis.indexedDB){reject(Error('Storage unavailable'));return;}
   const request=indexedDB.open('mobile-k-replay',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('saved');
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(Error('Storage blocked'));
   request.onsuccess=()=>resolve(request.result);
  });
 },
 async write(values){
  const db=await this.open();
  try{await new Promise((resolve,reject)=>{
   const tx=db.transaction('saved','readwrite');
   tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Save aborted'));tx.onerror=()=>reject(tx.error);
   for(const [key,value] of Object.entries(values))tx.objectStore('saved').put(value,key);
  });}finally{db.close();}
 },
 async read(){
  const db=await this.open();
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('saved','readonly'),result={};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error('Read aborted'));tx.onerror=()=>reject(tx.error);
   for(const key of ['csv','selection']){const request=tx.objectStore('saved').get(key);request.onsuccess=()=>{result[key]=request.result;};}
  });}finally{db.close();}
 }
};
