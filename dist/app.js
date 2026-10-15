'use strict';
const MAX_VISIBLE_BARS=450;
const $=id=>document.getElementById(id), canvas=$('chart'), ctx=canvas.getContext('2d');
let rows=[], series={}, idx=-1, tf=5, selectedDay='', dayStart=0, dayEnd=-1, live=null;
let mode='single', playing=false, elapsed=0, prevWall=0, singleMs=1000, dynamicRate=8;
let position=0, average=0, realized=0, fills=[], multiplier=10, cost=23, slippage=5;
let stopPrice=null,stopDrag=null;
let horizontalBook={},horizontalSequence=0,horizontalDrag=null,horizontalTap=null;
const horizontalElements=new Map();let horizontalRenderedKey=null;
let sourceName='示範行情', demoMode=true, viewCount=45, pan=0, selectedBar=null, priceRange=null;
let ma=[{on:false,p:5,color:'#ffce5c'},{on:false,p:10,color:'#71baff'},{on:false,p:20,color:'#d3a0ff'}];
let builtin=false,builtinIndex=null,builtinLoading=false,builtinMonthCache=new Map();
let manualPriceRange=null,manualPan=false;
let timeframeViews={},timeframeFitKeys={};
let rememberReady=false,dayOnly=false;
let wholeDayFit=false,wholeDaySaved={};
let chartType='candles',candleTimeframe=5;
let intradayViewport=null,candleViewport=null;
let chartFullscreen=false,fullscreenPreferred=false;
function rememberSelection(){if(rememberReady&&!importing)replayStore.write({selection:{kind:builtin?'builtin':demoMode?'demo':'csv',day:selectedDay,chartType,fullscreenPreferred}}).catch(()=>{});}
let renderPending=false, toastTimer, drawingMap=null;
const fmt=(n,d=1)=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:d});
const money=n=>(n<0?'−$':n>0?'+$':'$')+fmt(Math.abs(n),0);
const clock=t=>new Date(t).toISOString().slice(11,19);
const bucket=(t,p=tf)=>{const m=new Date(t).getUTCHours()*60+new Date(t).getUTCMinutes(),a=m>=900?900:m>=525?525:0;return t-(m-a)%p*MIN};
function notify(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2300)}
function buildSeries(data,p){const bars=[],starts=[],ends=[],map=new Int32Array(data.length);data.forEach((r,i)=>{const k=bucket(r.t,p);let b=bars[bars.length-1];if(!b||b.t!==k){b={...r,t:k};bars.push(b);starts.push(i);ends.push(i)}else{b.h=Math.max(b.h,r.h);b.l=Math.min(b.l,r.l);b.c=r.c;b.v+=r.v;ends[ends.length-1]=i}map[i]=bars.length-1});const sums=[0];bars.forEach(b=>sums.push(sums[sums.length-1]+b.c));return{bars,starts,ends,map,sums}}
function currentPrice(){return live?live.bar.c:idx>=0?rows[idx].c:null}
function currentTime(){return live?rows[live.i].t+live.progress*MIN:idx>=0?rows[idx].t+MIN:rows[dayStart]?.t}
function floating(){const p=currentPrice();return p===null||!position?0:(p-Math.sign(position)*slippage-average)*position*multiplier-Math.abs(position)*cost*2}
function signed(el,n,text){el.textContent=text;el.classList.toggle('positive',n>0);el.classList.toggle('negative',n<0)}
function update(){const intraday=chartType==='intraday';$('lineChart').classList.toggle('selected',intraday);$('lineChart').setAttribute('aria-pressed',String(intraday));$('lineChart').disabled=builtinLoading||importing||!rememberReady;$('enterFullscreen').disabled=builtinLoading||importing||!rememberReady;$('addHorizontal').disabled=builtinLoading||importing||!rememberReady;$('clearHorizontal').disabled=builtinLoading||importing||!rememberReady;document.querySelector('.periods').hidden=intraday;$('intradayLabel').hidden=!intraday;$('chart').setAttribute('aria-label',intraday?'當日分時價格線，只顯示已揭露的行情，可雙指縮放及拖曳':'已揭露的K線圖，可雙指縮放及拖曳');$('dayOnly').classList.toggle('selected',dayOnly||intraday);$('dayOnly').setAttribute('aria-pressed',String(dayOnly||intraday));$('dayOnly').disabled=intraday||builtinLoading||importing||!rememberReady;for(const id of ['zoomIn','zoomOut','latest','wholeDay'])$(id).disabled=builtinLoading||importing||!rememberReady;$('wholeDay').classList.toggle('selected',wholeDayFit);$('wholeDay').setAttribute('aria-pressed',String(wholeDayFit));$('wholeDay').setAttribute('aria-label',wholeDayFit?'離開全日顯示，恢復手動縮放並跟隨最新價格':'自動縮放顯示當日已揭露的全部走勢');const p=currentPrice(),now=currentTime();$('price').textContent=p===null?'—':fmt(p);$('clock').textContent=now?clock(now):'—';$('dateLabel').textContent=now?date(now):'—';$('sourceBadge').textContent=demoMode?'示範行情 · 非真實報價':(builtin?'小台日盤 · ':'CSV · ')+selectedDay;$('sourceBadge').style.color=demoMode?'#e5b764':'#95a3b6';
 signed($('position'),position,position?(position>0?'多 ':'空 ')+Math.abs(position)+' 口':'0 口');$('average').textContent='均價 '+(position?fmt(average,2):'—');signed($('floating'),floating(),fmt(Math.abs(floating()),0));$('points').textContent=position?fmt((p-Math.sign(position)*slippage-average)*Math.sign(position),1)+' 點／口':'0 點';signed($('realized'),realized,fmt(Math.abs(realized),0));$('total').textContent='合計 '+money(realized+floating());signed($('fullscreenPnl'),realized+floating(),money(realized+floating()));$('fullscreenPnl').setAttribute('aria-label','本次合計損益 '+money(realized+floating()));
 $('play').textContent=playing?'Ⅱ 暫停':'▶ 播放';$('play').setAttribute('aria-pressed',String(playing));$('fullscreenPlay').textContent=playing?'Ⅱ':'▶';$('fullscreenPlay').setAttribute('aria-label',playing?'暫停':'播放');$('fullscreenPlay').setAttribute('aria-pressed',String(playing));const ended=idx>=dayEnd&&!live;$('closeDay').disabled=builtinLoading||importing||!rememberReady||ended;$('randomDay').disabled=builtinLoading||importing||!rememberReady;$('stopLoss').disabled=!position||ended||builtinLoading||importing;$('stopLoss').classList.toggle('selected',stopPrice!==null);$('stopLoss').setAttribute('aria-pressed',String(stopPrice!==null));$('play').disabled=builtinLoading||importing||!rememberReady;$('fullscreenPlay').disabled=$('play').disabled;$('buy').disabled=$('sell').disabled=builtinLoading||p===null||ended||idx<dayStart&&!live;$('barStatus').textContent=ended?'當日資料結束':live?'形成中':idx<dayStart?'等待第一根':intraday?'分時 · 1 分鐘':(rows[idx]&&rows[idx+1]&&bucket(rows[idx].t)===bucket(rows[idx+1].t)?'形成中':'已收 K');
 $('modeHint').textContent=ended?'本日結束 · 已自動平倉':mode==='dynamic'?'OHLC 模擬路徑 · 非真實逐筆':'反向按鈕減倉，歸零後再按才反手';$('multiplier').disabled=$('cost').disabled=$('slippage').disabled=!!fills.length;
 document.querySelectorAll('[data-tf]').forEach(b=>{b.classList.toggle('selected',+b.dataset.tf===tf);b.setAttribute('aria-pressed',String(+b.dataset.tf===tf))});$('singleMode').classList.toggle('selected',mode==='single');$('dynamicMode').classList.toggle('selected',mode==='dynamic');$('singleMode').setAttribute('aria-pressed',String(mode==='single'));$('dynamicMode').setAttribute('aria-pressed',String(mode==='dynamic'));requestDraw();}
function requestDraw(){if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;draw()})}
function trade(side,quiet=false,quoteOverride=null,timeOverride=null){if(builtinLoading&&!quiet)return false;const quote=quoteOverride??currentPrice();const p=quote===null?null:quote+side*slippage;if(p===null||(!quiet&&(idx>=dayEnd&&!live||idx<dayStart&&!live)))return false;if(!quiet&&Math.abs(position+side)>99){notify('最多持有 99 口');return false}
 if(!position){position=side;average=p}else if(Math.sign(position)===side){average=(average*Math.abs(position)+p)/(Math.abs(position)+1);position+=side}else{realized+=(p-average)*Math.sign(position)*multiplier-cost*2;position+=side;if(!position)average=0}
 fills.push({t:timeOverride??(live?rows[live.i].t:rows[idx].t),p,side});if(!position)stopPrice=null;update();return true}
// Stop checks consume only newly traversed OHLC path segments, never a past wick.
function pathPrice(r,progress){
 const path=r.c>=r.o?[r.o,r.l,r.h,r.c]:[r.o,r.h,r.l,r.c];
 const k=Math.min(2,Math.floor(progress*3));return progress>=1?r.c:Math.round(path[k]+(path[k+1]-path[k])*(progress*3-k));
}
function checkStopPath(r,from=0,to=1){
 if(stopPrice===null||!position||stopDrag)return false;
 const direction=Math.sign(position),level=stopPrice;
 const points=[from,...[1/3,2/3].filter(x=>x>from&&x<to),to];
 let prev=pathPrice(r,points[0]);
 const hit=p=>direction>0?p<=level:p>=level;
 let execution=hit(prev)?prev:null;
 for(let n=1;execution===null&&n<points.length;n++){const p=pathPrice(r,points[n]);if(hit(p))execution=level;prev=p;}
 if(execution===null)return false;
 stopPrice=null;while(position)trade(-direction,true,execution,r.t);
 return true;
}
function toggleStopLoss(){
 if(!position||builtinLoading||importing)return;
 if(stopPrice!==null){stopPrice=null;update();return;}
 const p=currentPrice(),gap=Math.max(20,Math.round((priceRange?priceRange[1]-priceRange[0]:100)*.08));
 stopPrice=Math.round(position>0?Math.min(average,p)-gap:Math.max(average,p)+gap);
 priceRange=null;delete timeframeFitKeys[tf];update();
}
function dragStopTo(clientY){
 if(!stopDrag||!position)return;
 const d=stopDrag,p=currentPrice(),yy=Math.max(d.top+2,Math.min(d.top+d.height-2,clientY-(d.offset||0))),price=Math.round(d.hi-(yy-d.top)/d.height*(d.hi-d.lo));
 stopPrice=position>0?Math.min(price,Math.floor(p)-1):Math.max(price,Math.ceil(p)+1);requestDraw();
}
function finishStopDrag(cancel=false){
 if(!stopDrag)return;
 const d=stopDrag;stopDrag=null;if(cancel&&position)stopPrice=d.original;
 if(d.resume&&position&&idx<dayEnd){playing=true;prevWall=0;}
 delete timeframeFitKeys[tf];update();
}
function stop(){playing=false;prevWall=0;update()}
function endCheck(){if(idx<dayEnd||live)return false;playing=false;prevWall=0;while(position)trade(-Math.sign(position),true);update();return true}
function nextBar(){if(builtinLoading)return;if(idx>=dayEnd&&!live)return;const start=live?live.i:idx+1;const k=bucket(rows[start].t);let end=start;while(end<dayEnd&&bucket(rows[end+1].t)===k)end++;for(let n=start;n<=end;n++)checkStopPath(rows[n],live&&n===live.i?live.progress:0,1);idx=end;live=null;elapsed=0;selectedBar=null;if(!manualPan)pan=0;priceRange=null;endCheck();update()}
function startLive(){if(idx>=dayEnd)return false;const i=idx+1,r=rows[i];live={i,progress:0,bar:{...r,h:r.o,l:r.o,c:r.o,v:0}};selectedBar=null;checkStopPath(r,0,0);return true}
function advanceLive(delta){let remaining=delta;while(remaining>0){if(!live&&!startLive()){endCheck();break}const used=Math.min(1-live.progress,remaining);const prior=live.progress;live.progress+=used;remaining-=used;checkStopPath(rows[live.i],prior,live.progress);const r=rows[live.i],path=r.c>=r.o?[r.o,r.l,r.h,r.c]:[r.o,r.h,r.l,r.c],s=Math.min(2,Math.floor(live.progress*3)),f=live.progress>=1?1:live.progress*3-s;const price=live.progress>=1?r.c:Math.round(path[s]+(path[s+1]-path[s])*f);const visited=path.slice(0,s+1);live.bar={...r,h:Math.max(...visited,price),l:Math.min(...visited,price),c:price,v:r.v*live.progress};if(live.progress>=1-1e-9){idx=live.i;live=null;if(endCheck())break}}
 update()}
function tick(wall){if(playing){const dt=prevWall?Math.min(250,wall-prevWall):0;prevWall=wall;if(mode==='dynamic')advanceLive(dt*dynamicRate/MIN);else{elapsed+=dt;if(elapsed>=singleMs){elapsed-=singleMs;nextBar()}}}requestAnimationFrame(tick)}
async function togglePlay(){
 if(builtinLoading||importing||!rememberReady)return;
 if(playing){stop();return;}
 if(idx>=dayEnd&&!live){
  const dates=Array.from($('datePick').options,o=>o.value),at=dates.indexOf(selectedDay),next=at>=0?dates[at+1]:null;
  if(!next){notify('已到資料最後一天，可按隨機或重播繼續練習');return;}
  // Continuing a session keeps the account history; selecting/randomizing a day still resets it.
  const history={realized,fills:fills.slice(),lines:horizontalLines().map(l=>({...l,locked:true}))};
  if(builtin){if(!await loadBuiltin(next))return;}else setDay(next);
  realized=history.realized;fills=history.fills;
  const currentLines=horizontalLines(),lineIds=new Set(currentLines.map(l=>l.id));
  const carried=history.lines.filter(l=>!lineIds.has(l.id));
  if(carried.length){horizontalBook[horizontalKey()]=[...currentLines,...carried];saveHorizontalLines();}
  notify('接續 '+next+' · 從開盤播放');
 }
 playing=true;prevWall=0;elapsed=0;if(!manualPan)pan=0;selectedBar=null;
 if(mode==='dynamic'&&!live)startLive();update();
}
function changeMode(next){if(mode===next)return;if(next==='single'&&live){checkStopPath(rows[live.i],live.progress,1);idx=live.i;live=null;endCheck()}mode=next;elapsed=0;prevWall=0;priceRange=null;speedOptions();update()}
function speedOptions(){const opts=mode==='single'?[[2000,'2 秒／根'],[1500,'1.5 秒／根'],[1000,'1 秒／根'],[500,'0.5 秒／根']]:[[1,'1 倍'],[4,'4 倍'],[8,'8 倍'],[16,'16 倍'],[24,'24 倍']];$('speed').replaceChildren(...opts.map(([v,l])=>new Option(l,v)));$('speed').value=mode==='single'?singleMs:dynamicRate}
function clearTrades(){finishHorizontalDrag(true,false);horizontalTap=null;intradayViewport=null;candleViewport=null;wholeDayFit=chartType==='intraday';wholeDaySaved=wholeDayFit?{1:{count:viewCount,range:null}}:{};stopPrice=null;stopDrag=null;timeframeViews={};timeframeFitKeys={};manualPan=false;manualPriceRange=null;position=0;average=0;realized=0;fills=[];live=null;elapsed=0;pan=0;priceRange=null;selectedBar=null}
function setDay(d){stop();clearTrades();selectedDay=d;dayStart=rows.findIndex(r=>date(r.t)===d);dayEnd=dayStart;while(dayEnd+1<rows.length&&date(rows[dayEnd+1].t)===d)dayEnd++;idx=dayStart-1;$('datePick').value=d;update();rememberSelection()}
function install(data,name,isDemo,options={}){stop();clearTrades();idx=-1;builtin=!!options.builtin;rows=data;series={};for(const p of [1,5,30])series[p]=buildSeries(data,p);sourceName=name;demoMode=isDemo;const dates=options.dates||[...new Set(rows.map(r=>date(r.t)))];$('datePick').replaceChildren(...dates.map(d=>new Option(d,d)));$('fileInfo').textContent=(isDemo?'合成示範 · 非真實歷史行情':name)+' · '+fmt(rows.length,0)+' 根 1 分 K';setDay(options.day||(isDemo?dates[dates.length-1]:dates[0]));}
async function loadBuiltin(day){
 if(builtinLoading||importing)return false;stop();builtinLoading=true;update();$('importError').textContent='正在載入內建行情…';$('builtin').disabled=$('startDay').disabled=$('demo').disabled=$('file').disabled=true;
 try{
  if(!builtinIndex){const response=await fetch('data/index.json');if(!response.ok)throw Error('行情目錄讀取失敗');const meta=await response.json();if(!Array.isArray(meta.dates)||!meta.dates.length||!Array.isArray(meta.months))throw Error('行情目錄格式錯誤');builtinIndex=meta}
  const chosen=day&&builtinIndex.dates.includes(day)?day:builtinIndex.dates[builtinIndex.dates.length-1];
  const month=chosen.slice(0,7),mi=builtinIndex.months.indexOf(month),needed=builtinIndex.months.slice(Math.max(0,mi-1),mi+1);
  const blocks=await Promise.all(needed.map(async m=>{if(builtinMonthCache.has(m))return builtinMonthCache.get(m);const response=await fetch('data/'+m+'.json');if(!response.ok)throw Error('日期行情讀取失敗');const raw=await response.json();if(!Array.isArray(raw)||!raw.length)throw Error('行情內容空白');const data=raw.map(a=>{if(!Array.isArray(a)||a.length!==6||a.some(x=>!Number.isFinite(x)))throw Error('行情格式錯誤');return{t:a[0]*MIN,o:a[1],h:a[2],l:a[3],c:a[4],v:a[5]}});builtinMonthCache.set(m,data);return data}));
  const data=blocks.flat();if(!data.some(r=>date(r.t)===chosen))throw Error('所選日期沒有行情');
  install(data,builtinIndex.name,false,{builtin:true,dates:builtinIndex.dates,day:chosen});
  for(const key of builtinMonthCache.keys())if(!needed.includes(key))builtinMonthCache.delete(key);
  const end=clock(rows[dayEnd].t+MIN).slice(0,5);
  $('fileInfo').textContent='已內建：'+builtinIndex.dates[0]+' ～ '+builtinIndex.dates[builtinIndex.dates.length-1]+'，共 '+builtinIndex.dates.length+' 日。本日 '+(dayEnd-dayStart+1)+' 根，資料至 '+end+'。行情為小台，損益按微台換算。';
  $('importError').textContent='';return true;
 }catch(err){$('importError').textContent=err.message+'，請確認網路後按「使用內建行情」重試。';notify('內建行情尚未載入，可從「資料」重試');return false}
 finally{builtinLoading=false;$('builtin').disabled=$('startDay').disabled=$('demo').disabled=$('file').disabled=false;update()}
}
function demoData(){let seed=314159,price=18000;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296},a=[];for(let d=1;d<=2;d++){for(let i=0;i<300;i++){let o=price,drift=i<70?1.9:i<125?-.5:i<195?-2.1:1.25,c=Math.round(o+drift+(rnd()-.5)*19),h=Math.max(o,c)+Math.ceil(rnd()*12),l=Math.min(o,c)-Math.ceil(rnd()*12);a.push({t:Date.UTC(2024,1,d,8,45)+i*MIN,o,h,l,c,v:Math.round(100+rnd()*1900)});price=c}}return a}
function getVisibleSeries(){const s=series[tf],i=live?live.i:idx;if(!s||i<0||(dayOnly||wholeDayFit)&&i<dayStart)return{bars:[],partialIndex:-1};const g=s.map[i],complete=idx>=0?s.map[idx]:-1;let partial=null;if(live||s.ends[g]>idx){const from=s.starts[g];for(let n=from;n<=idx;n++){const r=rows[n];if(!partial)partial={...r,t:s.bars[g].t};else{partial.h=Math.max(partial.h,r.h);partial.l=Math.min(partial.l,r.l);partial.c=r.c;partial.v+=r.v}}if(live){const r=live.bar;if(!partial)partial={...r,t:s.bars[g].t};else{partial.h=Math.max(partial.h,r.h);partial.l=Math.min(partial.l,r.l);partial.c=r.c;partial.v+=r.v}}}
 // Only completed bars are borrowed from the precomputed series; rebuild the current incomplete bar from revealed minutes.
 const end=g+1;return{bars:s.bars,partial,partialIndex:partial?g:-1,length:end,get:n=>partial&&n===g?partial:s.bars[n],sumBefore:n=>s.sums[n]};}
function expandRange(range,required){
 if(!required||required[0]>=range[0]&&required[1]<=range[1])return range;
 const pad=Math.max(4,(required[1]-required[0])*.06);
 return[Math.min(range[0],required[0]-pad),Math.max(range[1],required[1]+pad)];
}
// Full-day fit never reveals future bars and keeps the manual scale separately.
function leaveWholeDay(){
 if(!wholeDayFit)return;
 const saved=wholeDaySaved[tf];
 if(saved){viewCount=saved.count;manualPriceRange=saved.range?[...saved.range]:null;}
 wholeDayFit=false;manualPan=false;pan=0;priceRange=null;selectedBar=null;
 delete timeframeFitKeys[tf];update();
}
function showWholeDay(){
 if(wholeDayFit){leaveWholeDay();return;}
 wholeDaySaved[tf]={count:viewCount,range:manualPriceRange?[...manualPriceRange]:priceRange?[...priceRange]:null};
 wholeDayFit=true;pan=0;manualPan=false;priceRange=null;selectedBar=null;
 delete timeframeFitKeys[tf];update();
}
function draw(){const bounds=canvas.getBoundingClientRect(),w=bounds.width,h=bounds.height;if(!w||!h)return;const dpr=Math.min(window.devicePixelRatio||1,3);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#090d14';ctx.fillRect(0,0,w,h);if(chartType==='intraday'){drawIntraday(w,h);return;}const vis=getVisibleSeries();if(!vis.length){$('stopHandle').hidden=true;ctx.fillStyle='#95a3b6';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('按「播放」開始複盤',w/2,h/2);$('legend').replaceChildren();drawingMap=null;renderHorizontalLines();return}
 const right=30,left=8,top=chartFullscreen?12:(w>500&&h<400?(ma.some(m=>m.on)?50:38):(ma.some(m=>m.on)?30:14)),bottom=21,plotW=w-right-left,plotH=Math.max(40,h-top-bottom);
 const todayStart=series[tf].map[dayStart],count=wholeDayFit?Math.max(12,vis.length-todayStart+2):Math.max(12,Math.min(MAX_VISIBLE_BARS,viewCount));
 const lower=dayOnly||wholeDayFit?todayStart:0;
 pan=Math.max(-(count-5),Math.min(pan,Math.max(0,vis.length-lower-1)));
 const virtualEnd=wholeDayFit?vis.length:Math.max(lower+1,vis.length-Math.round(pan)),end=Math.min(vis.length,virtualEnd);
 const plotStart=wholeDayFit?todayStart:virtualEnd-count,start=Math.max(lower,plotStart),dx=plotW/count,x=n=>left+(n-plotStart+.5)*dx;
 const bars=[];for(let n=start;n<end;n++)bars.push(vis.get(n));let lo=Math.min(...bars.map(r=>r.l)),hi=Math.max(...bars.map(r=>r.h));
 function maValue(n,p){if(n+1<p)return null;return (vis.sumBefore(n)-vis.sumBefore(n+1-p)+vis.get(n).c)/p}
 ma.forEach(m=>{if(m.on){for(let n=start;n<end;n++){const v=maValue(n,m.p);if(v!==null){lo=Math.min(lo,v);hi=Math.max(hi,v)}}}});
 for(const line of horizontalLines()){lo=Math.min(lo,line.price);hi=Math.max(hi,line.price)}
 if(position){lo=Math.min(lo,average);hi=Math.max(hi,average)}if(stopPrice!==null){lo=Math.min(lo,stopPrice);hi=Math.max(hi,stopPrice)}let pad=Math.max(12,(hi-lo)*.16);lo-=pad;hi+=pad;
 // Manual zoom keeps its span; following shifts the center instead of shrinking candles.
 const required=[lo+pad,hi-pad];
 const key=selectedDay+':'+idx+':'+position+':'+average+':'+stopPrice+':'+(live?live.i+','+live.bar.h+','+live.bar.l:'');
 const changed=timeframeFitKeys[tf]!==key;
 if(!wholeDayFit&&manualPriceRange){
  const span=manualPriceRange[1]-manualPriceRange[0];
  const center=currentPrice()??((manualPriceRange[0]+manualPriceRange[1])/2);
  if(!manualPan&&!gesture&&!stopDrag)manualPriceRange=[center-span/2,center+span/2];
  [lo,hi]=manualPriceRange;
 }else if(!wholeDayFit&&priceRange){
  [lo,hi]=priceRange;
  if(changed&&!gesture&&!stopDrag)[lo,hi]=expandRange([lo,hi],required);
 }
 timeframeFitKeys[tf]=key;
 if(stopDrag||horizontalDrag){const d=stopDrag||horizontalDrag;lo=d.lo;hi=d.hi;}priceRange=[lo,hi];const y=v=>top+(hi-v)/(hi-lo)*plotH;

 ctx.lineWidth=1;ctx.font='10px -apple-system,sans-serif';ctx.textAlign='left';for(let n=0;n<=4;n++){const yy=top+plotH*n/4,val=hi-(hi-lo)*n/4;ctx.strokeStyle='#1b2431';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();ctx.fillStyle='#92a0b3';ctx.fillText(String(Math.round(val)),w-right+2,yy+4,right-4)}
 ctx.save();ctx.beginPath();ctx.rect(left,top-20,plotW,plotH+30);ctx.clip();for(let n=start;n<end;n++){let b=vis.get(n),xx=x(n),col=b.c>=b.o?'#ff435b':'#f0f3f8',bw=Math.min(dx*.85,Math.max(.5,dx*.63));ctx.strokeStyle=col;ctx.lineWidth=Math.min(1,dx*.65);ctx.beginPath();ctx.moveTo(xx,y(b.h));ctx.lineTo(xx,y(b.l));ctx.stroke();ctx.fillStyle=col;ctx.fillRect(xx-bw/2,Math.min(y(b.o),y(b.c)),bw,Math.max(1.5,Math.abs(y(b.o)-y(b.c))))}
 ma.forEach(m=>{if(!m.on)return;ctx.strokeStyle=m.color;ctx.lineWidth=1.3;ctx.beginPath();let first=true;for(let n=start;n<end;n++){let v=maValue(n,m.p);if(v===null)continue;if(first){ctx.moveTo(x(n),y(v));first=false}else ctx.lineTo(x(n),y(v))}ctx.stroke()});
 const timeIndex=new Map();for(let n=start;n<end;n++)timeIndex.set(vis.get(n).t,n);fills.forEach(f=>{let n=timeIndex.get(bucket(f.t));if(n===undefined)return;let xx=x(n),yy=y(f.p);ctx.fillStyle=f.side>0?'#ff244a':'#00f39a';ctx.strokeStyle='#fff';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(xx,yy+(f.side>0?-6:6));ctx.lineTo(xx-5,yy+(f.side>0?4:-4));ctx.lineTo(xx+5,yy+(f.side>0?4:-4));ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle=f.side>0?'#ff435b':'#25e19a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx-7,yy);ctx.lineTo(xx+7,yy);ctx.stroke()});
 if(position){ctx.strokeStyle=position>0?'#ff435b88':'#25e19a88';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(left,y(average));ctx.lineTo(w-right,y(average));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=position>0?'#ff6578':'#25e19a';ctx.font='10px -apple-system,sans-serif';ctx.textAlign='left';ctx.fillText('持倉均價 '+fmt(average,2),left+3,y(average)-4)}ctx.restore();
 const handle=$('stopHandle');handle.hidden=stopPrice===null||!position;
 if(!handle.hidden){const yy=y(stopPrice);ctx.strokeStyle='#f5cd48';ctx.lineWidth=1.5;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();ctx.setLineDash([]);handle.style.top=Math.max(top,Math.min(h-bottom,yy))+'px';handle.textContent='';handle.setAttribute('aria-label','停損 '+fmt(stopPrice)+'，上下拖曳調整');}

 const p=currentPrice();if(p!==null&&p>=lo&&p<=hi){ctx.strokeStyle='#7894b877';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(left,y(p));ctx.lineTo(w-right,y(p));ctx.stroke();ctx.setLineDash([]);}
 ctx.fillStyle='#8492a6';ctx.font='10px -apple-system,sans-serif';ctx.textAlign='center';for(let n=start;n<end;n+=Math.max(1,Math.floor(count/4))){let b=vis.get(n);ctx.fillText(clock(b.t).slice(0,5),x(n),h-8)}let selected=selectedBar!==null?Math.max(start,Math.min(end-1,selectedBar)):end-1;const b=vis.get(selected);
 $('legend').replaceChildren(...ma.filter(m=>m.on).map(m=>{let e=document.createElement('span');e.style.color=m.color;const v=maValue(selected,m.p);e.textContent='MA'+m.p+' '+(v===null?'—':fmt(v));return e}));drawingMap={start,end,plotStart,dx,left,w,h,right,bottom,top,plotH,lo,hi};renderHorizontalLines();}
// Price annotations are shared by chart types and stored separately from orders.
function horizontalKey(){return JSON.stringify([builtin?'builtin':demoMode?'demo':'csv',sourceName,selectedDay]);}
function horizontalLines(){return horizontalBook[horizontalKey()]||[];}
function saveHorizontalLines(){
 replayStore.write({annotations:horizontalBook}).catch(()=>notify('水平線本次可用，但保存失敗，重新開啟後可能需要重畫'));
}
function startHorizontalDrag(e,line){
 if(line.locked!==false||!drawingMap||stopDrag||horizontalDrag||builtinLoading||importing)return;
 e.preventDefault();e.stopPropagation();
 const rect=canvas.getBoundingClientRect(),m=drawingMap;
 pointers.clear();gesture=null;canvas.style.cursor='default';
 horizontalDrag={pointerId:e.pointerId,line,key:horizontalKey(),original:line.price,resume:playing,
  lo:m.lo,hi:m.hi,top:rect.top+m.top,height:m.plotH,
  offset:e.clientY-(rect.top+m.top+(m.hi-line.price)/(m.hi-m.lo)*m.plotH)};
 e.currentTarget.setPointerCapture(e.pointerId);playing=false;prevWall=0;update();
}
function moveHorizontalDrag(e){
 if(!horizontalDrag||e.pointerId!==horizontalDrag.pointerId)return;
 e.preventDefault();e.stopPropagation();const d=horizontalDrag;
 const yy=Math.max(2,Math.min(d.height-2,e.clientY-d.top-d.offset));
 d.line.price=Math.round(d.hi-yy/d.height*(d.hi-d.lo));requestDraw();
}
function finishHorizontalDrag(cancel=false,resume=true){
 if(!horizontalDrag)return;const d=horizontalDrag;horizontalDrag=null;
 if(cancel)d.line.price=d.original;else saveHorizontalLines();
 if(resume&&d.resume&&idx<dayEnd){playing=true;prevWall=0;}
 requestDraw();
}
function bindHorizontalGrip(button,line){
 button.addEventListener('pointerdown',e=>startHorizontalDrag(e,line));
 button.addEventListener('pointermove',moveHorizontalDrag);
 button.addEventListener('pointerup',e=>{if(e.pointerId===horizontalDrag?.pointerId){e.preventDefault();e.stopPropagation();finishHorizontalDrag();update();}});
 button.addEventListener('pointercancel',e=>{if(e.pointerId===horizontalDrag?.pointerId){finishHorizontalDrag(true);update();}});
 button.addEventListener('lostpointercapture',e=>{if(e.pointerId===horizontalDrag?.pointerId){finishHorizontalDrag(true);update();}});
}
function renderHorizontalLines(){
 const container=$('horizontalLines'),key=horizontalKey();
 if(horizontalRenderedKey!==key){container.replaceChildren();horizontalElements.clear();horizontalRenderedKey=key;}
 const lines=horizontalLines(),ids=new Set(lines.map(l=>l.id));
 for(const [id,element] of horizontalElements){if(!ids.has(id)){element.remove();horizontalElements.delete(id);}}
 for(const line of lines){
  let element=horizontalElements.get(line.id);
  if(!element){
   element=document.createElement('div');element.className='horizontal-line';element.dataset.lineId=line.id;
   const grip=document.createElement('button');grip.className='horizontal-grip';
   bindHorizontalGrip(grip,line);
   element.append(grip);container.append(element);horizontalElements.set(line.id,element);
  }
  const m=drawingMap; element.hidden=!m||line.price<m.lo||line.price>m.hi;
  if(!m)continue;
  element.style.top=(m.top+(m.hi-line.price)/(m.hi-m.lo)*m.plotH)+'px';element.style.left=m.left+'px';element.style.setProperty('--line-right',m.right+'px');
  element.style.setProperty('--annotation-color',['#6fc9ff','#c4a0ff','#7ee2be','#f3a5cc'][(line.id-1)%4]);
  element.classList.toggle('editable',line.locked===false);
  const grip=element.firstElementChild;grip.tabIndex=line.locked===false?0:-1;
  grip.setAttribute('aria-label',line.locked===false?'可移動水平線，按住上下拖曳，點空白處鎖定':'已鎖定水平線，雙擊線條解鎖');

 }
}
function lockHorizontalLines(except=null){
 let changed=false;
 for(const line of horizontalLines()){
  const locked=line.id!==except;
  if(line.locked!==locked){line.locked=locked;changed=true;}
 }
 if(changed){horizontalTap=null;saveHorizontalLines();requestDraw();}
 return changed;
}
function horizontalAt(clientX,clientY){
 if(chartFullscreen||!drawingMap)return null;
 const rect=canvas.getBoundingClientRect(),m=drawingMap,x=clientX-rect.left,y=clientY-rect.top;
 if(x<m.left||x>m.w-m.right||y<m.top||y>m.h-m.bottom)return null;
 let found=null,distance=13;
 for(const line of horizontalLines()){
  if(line.price<m.lo||line.price>m.hi)continue;
  const gap=Math.abs(m.top+(m.hi-line.price)/(m.hi-m.lo)*m.plotH-y);
  if(gap<distance){distance=gap;found=line;}
 }
 return found;
}
function tapHorizontalCanvas(e,g){
 const line=g.horizontalLine,key=horizontalKey(),now=Date.now();
 if(line&&line.locked!==false){
  if(horizontalTap&&horizontalTap.key===key&&horizontalTap.id===line.id&&now-horizontalTap.at<380&&Math.hypot(e.clientX-horizontalTap.x,e.clientY-horizontalTap.y)<24){
   lockHorizontalLines(line.id);horizontalTap=null;
  }else horizontalTap={id:line.id,key,at:now,x:e.clientX,y:e.clientY};
  return true;
 }
 horizontalTap=null;
 return lockHorizontalLines();
}
function addHorizontalLine(){
 if(builtinLoading||importing||!rememberReady||horizontalDrag||stopDrag)return;
 if(!drawingMap){notify('請先播放行情，再新增水平線');return;}
 lockHorizontalLines();
 const key=horizontalKey(),line={id:++horizontalSequence,price:Math.round((drawingMap.lo+drawingMap.hi)/2),locked:false};
 (horizontalBook[key]??=[]).push(line);saveHorizontalLines();requestDraw();
}
$('addHorizontal').onclick=addHorizontalLine;
$('clearHorizontal').onclick=()=>{
 if(builtinLoading||importing||!rememberReady||horizontalDrag)return;
 horizontalBook[horizontalKey()]=[];horizontalTap=null;saveHorizontalLines();requestDraw();
};
// Intraday charts use only revealed one-minute closes and the current simulated quote.
// Viewports use minute units so line and candle charts share gestures and controls.
function intradayPoints(){
 const points=[];
 if(idx>=dayStart||live){
  points.push({t:rows[dayStart].t,c:rows[dayStart].o});
  for(let n=dayStart;n<=Math.min(idx,dayEnd);n++)points.push({t:rows[n].t+MIN,c:rows[n].c});
  if(live)points.push({t:rows[live.i].t+live.progress*MIN,c:live.bar.c});
 }
 return points;
}
function drawIntraday(w,h){
 const points=intradayPoints(),handle=$('stopHandle');$('legend').replaceChildren();
 if(!points.length){handle.hidden=true;drawingMap=null;ctx.fillStyle='#95a3b6';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('當日分時 · 按「播放」從開盤開始',w/2,h/2);return;}
 const left=8,right=42,top=chartFullscreen?12:w>500&&h<400?38:20,bottom=24,plotW=w-left-right,plotH=Math.max(40,h-top-bottom);
 const openingTime=points[0].t,lastTime=points[points.length-1].t;
 const count=wholeDayFit?Math.max(12,(lastTime-openingTime)/MIN+2):Math.max(12,Math.min(MAX_VISIBLE_BARS,viewCount));
 pan=Math.max(-(count-5),Math.min(pan,Math.max(0,(lastTime-openingTime)/MIN)));
 const to=wholeDayFit?openingTime+count*MIN:lastTime-pan*MIN+MIN/2,from=to-count*MIN,dx=plotW/count;
 const x=t=>left+(t-from)/MIN*dx;
 // Include adjacent revealed endpoints to draw continuous segments at the viewport edges.
 let first=points.findIndex(p=>p.t>=from);if(first<0)first=points.length-1;else first=Math.max(0,first-1);
 let end=points.findIndex(p=>p.t>to);end=end<0?points.length:Math.min(points.length,end+1);
 const shown=points.slice(first,Math.max(first+1,end));
 let lo=Math.min(...shown.map(p=>p.c)),hi=Math.max(...shown.map(p=>p.c));
 for(const line of horizontalLines()){lo=Math.min(lo,line.price);hi=Math.max(hi,line.price);}
 if(position){lo=Math.min(lo,average);hi=Math.max(hi,average);}
 if(stopPrice!==null){lo=Math.min(lo,stopPrice);hi=Math.max(hi,stopPrice);}
 const pad=Math.max(12,(hi-lo)*.15);lo-=pad;hi+=pad;
 if(!wholeDayFit&&manualPriceRange){
  const span=manualPriceRange[1]-manualPriceRange[0],center=currentPrice();
  if(!manualPan&&!gesture&&!stopDrag)manualPriceRange=[center-span/2,center+span/2];
  [lo,hi]=manualPriceRange;
 }
 if(stopDrag||horizontalDrag){const d=stopDrag||horizontalDrag;lo=d.lo;hi=d.hi;}
 priceRange=[lo,hi];const y=v=>top+(hi-v)/(hi-lo)*plotH;
 ctx.font='10px -apple-system,sans-serif';ctx.lineWidth=1;
 for(let n=0;n<=4;n++){
  const yy=top+plotH*n/4;ctx.strokeStyle='#1b2431';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();
  ctx.fillStyle='#92a0b3';ctx.textAlign='left';ctx.fillText(String(Math.round(hi-(hi-lo)*n/4)),w-right+3,yy+4,right-3);
  const t=from+(to-from)*n/4;if(t>=openingTime&&t<=rows[dayEnd].t+MIN){ctx.textAlign=n===0?'left':n===4?'right':'center';ctx.fillText(clock(t).slice(0,5),x(t),h-7);}
 }
 ctx.save();ctx.beginPath();ctx.rect(left,top,plotW,plotH);ctx.clip();
 const opening=points[0].c;ctx.strokeStyle='#92a0b366';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(left,y(opening));ctx.lineTo(w-right,y(opening));ctx.stroke();ctx.setLineDash([]);
 ctx.beginPath();shown.forEach((p,i)=>i?ctx.lineTo(x(p.t),y(p.c)):ctx.moveTo(x(p.t),y(p.c)));
 ctx.lineTo(x(shown[shown.length-1].t),top+plotH);ctx.lineTo(x(shown[0].t),top+plotH);ctx.closePath();
 const gradient=ctx.createLinearGradient(0,top,0,top+plotH);gradient.addColorStop(0,'#e5b76433');gradient.addColorStop(1,'#e5b76400');ctx.fillStyle=gradient;ctx.fill();
 ctx.beginPath();shown.forEach((p,i)=>i?ctx.lineTo(x(p.t),y(p.c)):ctx.moveTo(x(p.t),y(p.c)));ctx.strokeStyle='#f4cb69';ctx.lineWidth=1.8;ctx.lineJoin='round';ctx.stroke();
 const last=points[points.length-1];ctx.fillStyle='#f4cb69';ctx.beginPath();ctx.arc(x(last.t),y(last.c),3,0,Math.PI*2);ctx.fill();
 for(const f of fills){if(f.t<from||f.t>last.t)continue;const xx=x(f.t),yy=y(f.p);ctx.fillStyle=f.side>0?'#ff435b':'#25e19a';ctx.beginPath();ctx.moveTo(xx,yy+(f.side>0?-6:6));ctx.lineTo(xx-5,yy+(f.side>0?4:-4));ctx.lineTo(xx+5,yy+(f.side>0?4:-4));ctx.closePath();ctx.fill();}
 if(position){ctx.strokeStyle=position>0?'#ff435b88':'#25e19a88';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(left,y(average));ctx.lineTo(w-right,y(average));ctx.stroke();ctx.setLineDash([]);}
 ctx.restore();handle.hidden=stopPrice===null||!position;
 if(!handle.hidden){const yy=y(stopPrice);ctx.strokeStyle='#f5cd48';ctx.lineWidth=1.5;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();ctx.setLineDash([]);handle.style.top=Math.max(top,Math.min(h-bottom,yy))+'px';handle.setAttribute('aria-label','停損 '+fmt(stopPrice)+'，上下拖曳調整');}
 drawingMap={left,right,top,bottom,w,h,plotH,lo,hi,from,to,dx,points:points.length};renderHorizontalLines();
}
function captureChartViewport(){
 return {count:viewCount,pan,manualPan,fit:wholeDayFit,
  range:manualPriceRange?[...manualPriceRange]:null,autoRange:priceRange?[...priceRange]:null,
  revealed:getVisibleSeries().length||0,
  saved:Object.fromEntries(Object.entries(wholeDaySaved).map(([key,v])=>[key,{count:v.count,range:v.range?[...v.range]:null}]))};
}
function restoreChartViewport(view){
 viewCount=view?.count??45;manualPan=view?.manualPan??false;wholeDayFit=view?.fit??false;
 pan=(view?.pan??0)+(manualPan?(getVisibleSeries().length||0)-(view?.revealed??0):0);
 manualPriceRange=view?.range?[...view.range]:null;priceRange=view?.autoRange?[...view.autoRange]:null;
 wholeDaySaved=view?.saved??{};timeframeFitKeys={};
}
function toggleChartType(){
 if(builtinLoading||importing||!rememberReady||stopDrag||horizontalDrag)return;
 if(chartType==='candles'){
  candleTimeframe=tf;switchTimeframe(1);candleViewport=captureChartViewport();chartType='intraday';
  restoreChartViewport(intradayViewport??{count:45,fit:true,saved:{1:{count:45,range:null}}});
 }else{
  intradayViewport=captureChartViewport();chartType='candles';restoreChartViewport(candleViewport);switchTimeframe(candleTimeframe);
 }
 selectedBar=null;drawingMap=null;update();rememberSelection();
}
$('lineChart').onclick=toggleChartType;
// Each timeframe owns its viewport; manual pans are anchored to revealed bars.
function switchTimeframe(next){
 if(![1,5,30].includes(next)||next===tf||builtinLoading||importing)return;
 timeframeViews[tf]={count:viewCount,pan,manualPan,fit:wholeDayFit,
  range:manualPriceRange?[...manualPriceRange]:null,
  autoRange:priceRange?[...priceRange]:null,
  revealed:getVisibleSeries().length||0};
 tf=next;
 const saved=timeframeViews[tf];
 wholeDayFit=saved?.fit||false;
 viewCount=saved?saved.count:45;
 manualPan=saved?saved.manualPan:false;
 pan=saved?saved.pan+(manualPan?(getVisibleSeries().length||0)-saved.revealed:0):0;
 manualPriceRange=saved?.range?[...saved.range]:null;
 priceRange=saved?.autoRange?[...saved.autoRange]:null;
 selectedBar=null;drawingMap=null;update();
}
function toggleDayOnly(){
 if(builtinLoading||importing||!rememberReady)return;
 if(!dayOnly){if(!confirmReset())return;dayOnly=true;setDay(selectedDay);notify('當日模式：按播放從第一根開始');}
 else{dayOnly=false;leaveWholeDay();manualPan=false;pan=0;manualPriceRange=null;priceRange=null;timeframeFitKeys={};update();}
}
function confirmReset(){return !fills.length||confirm('重新開始會清除本次交易與損益，確定重播？')}
$('dayOnly').onclick=toggleDayOnly;$('wholeDay').onclick=showWholeDay;$('play').onclick=togglePlay;$('fullscreenPlay').onclick=togglePlay;$('stopLoss').onclick=toggleStopLoss;$('buy').onclick=()=>trade(1);$('sell').onclick=()=>trade(-1);$('singleMode').onclick=()=>changeMode('single');$('dynamicMode').onclick=()=>changeMode('dynamic');$('speed').onchange=()=>{if(mode==='single')singleMs=+$('speed').value;else dynamicRate=+$('speed').value;elapsed=0};
 document.querySelectorAll('[data-tf]').forEach(b=>b.onclick=()=>switchTimeframe(+b.dataset.tf));$('latest').onclick=()=>{leaveWholeDay();manualPan=false;pan=0;selectedBar=null;priceRange=null;requestDraw()};$('zoomIn').onclick=()=>{leaveWholeDay();viewCount=Math.max(12,viewCount-8);priceRange=null;requestDraw()};$('zoomOut').onclick=()=>{leaveWholeDay();viewCount=Math.min(MAX_VISIBLE_BARS,viewCount+8);priceRange=null;requestDraw()};$('reset').onclick=()=>{if(builtinLoading)return;stop();if(confirmReset())setDay(selectedDay)};
 ['data','settings'].forEach(key=>$(key+'Open').onclick=()=>{stop();$(key+'Dialog').showModal()});document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
 $('startDay').onclick=async()=>{if(builtinLoading||!confirmReset())return;const chosen=$('datePick').value;if(builtin){if(await loadBuiltin(chosen))$('dataDialog').close()}else{setDay(chosen);$('dataDialog').close()}};$('builtin').onclick=async()=>{if(builtinLoading||!confirmReset())return;if(await loadBuiltin())$('dataDialog').close()};$('demo').onclick=()=>{if(confirmReset()){install(demoData(),'示範行情',true);$('dataDialog').close()}};
 function jumpToClose(){
 if(builtinLoading||importing||!rememberReady||dayEnd<0)return;
 playing=false;prevWall=0;for(let n=live?live.i:idx+1;n<=dayEnd;n++)checkStopPath(rows[n],live&&n===live.i?live.progress:0,1);live=null;elapsed=0;idx=dayEnd;
 manualPan=false;pan=0;selectedBar=null;priceRange=null;
 endCheck();update();notify('已跳至本日資料收盤');
}
$('closeDay').onclick=jumpToClose;
 function pickRandomDay(dates,current,random=Math.random){
 // The first available date has no prior session close in this dataset.
 const eligible=dates.slice(1).filter(d=>d!==current);
 return eligible.length?eligible[Math.min(eligible.length-1,Math.floor(random()*eligible.length))]:null;
}
$('randomDay').onclick=async()=>{
 if(builtinLoading||importing||!rememberReady)return;
 const dates=Array.from($('datePick').options,o=>o.value);
 const chosen=pickRandomDay(dates,selectedDay);
 if(!chosen){notify('沒有其他可抽選的日期；需包含前一交易日資料');return;}
 stop();
 if(builtin){if(!await loadBuiltin(chosen))return;}else setDay(chosen);
 notify('隨機 '+chosen+' · 按播放從開盤開始');
};
 let importing=false;$('file').onchange=async e=>{const f=e.target.files[0];if(!f||importing||builtinLoading)return;if(!confirmReset()){e.target.value='';return}if(f.size>30*1024*1024){$('importError').textContent='手機版請匯入 30 MB 以下的 CSV，可先分段匯出。';e.target.value='';return}importing=true;$('importError').textContent='讀取中…';$('startDay').disabled=$('demo').disabled=$('builtin').disabled=true;try{const buf=await f.arrayBuffer(),decoded=decodeCSV(buf),parsed=parseCSV(decoded.text,$('stamp').value,$('session').value);install(parsed.rows,f.name,false);$('importError').textContent='正在保存到本機…';try{await replayStore.write({csv:{text:decoded.text,name:f.name,stamp:$('stamp').value,session:$('session').value},selection:{kind:'csv',day:selectedDay,chartType,fullscreenPreferred}});$('fileInfo').textContent+=' · 已保存到本機';$('importError').textContent='';$('dataDialog').close();notify('CSV 已保存，下次開啟自動載入')}catch(storageError){$('importError').textContent='本次已載入，但本機保存失敗；下次需要重新匯入。請確認未使用私密瀏覽並有足夠空間。';notify('已載入，但無法保存 CSV')}}catch(err){$('importError').textContent=err.message}finally{importing=false;$('startDay').disabled=$('demo').disabled=$('builtin').disabled=false;e.target.value='';update()}};
 ma.forEach((m,i)=>{const row=document.createElement('div');row.className='ma-row';row.style.setProperty('--ma',m.color);row.innerHTML='<label><input type="checkbox" aria-label="顯示第 '+(i+1)+' 條均線"><span class="swatch"></span>均線 '+(i+1)+'</label><input type="number" min="1" max="200" value="'+m.p+'" inputmode="numeric" aria-label="第 '+(i+1)+' 條均線週期">';const [check,period]=row.querySelectorAll('input');check.onchange=()=>{m.on=check.checked;priceRange=null;requestDraw()};period.onchange=()=>{m.p=Math.max(1,Math.min(200,Math.round(+period.value||5)));period.value=m.p;priceRange=null;requestDraw()};$('maSettings').append(row)});
 $('multiplier').onchange=()=>{multiplier=Math.max(1,Math.min(10000,+$('multiplier').value||10));$('multiplier').value=multiplier;update()};$('cost').onchange=()=>{cost=Math.max(0,Math.min(10000,+$('cost').value||0));$('cost').value=cost;update()};
 $('slippage').onchange=()=>{slippage=Math.max(0,Math.min(100,Math.round(+$('slippage').value||0)));$('slippage').value=slippage;update()};
 const stopHandle=$('stopHandle');
 stopHandle.addEventListener('pointerdown',e=>{
 if(stopPrice===null||!position||!drawingMap||stopDrag||horizontalDrag)return;
 e.preventDefault();e.stopPropagation();const r=canvas.getBoundingClientRect(),m=drawingMap;
 pointers.clear();gesture=null;canvas.style.cursor='default';
 stopDrag={id:e.pointerId,original:stopPrice,resume:playing,lo:m.lo,hi:m.hi,top:r.top+m.top,height:m.plotH,offset:e.clientY-(r.top+m.top+(m.hi-stopPrice)/(m.hi-m.lo)*m.plotH)};
 stopHandle.setPointerCapture(e.pointerId);playing=false;prevWall=0;update();
 });
 stopHandle.addEventListener('pointermove',e=>{if(stopDrag?.id===e.pointerId){e.preventDefault();e.stopPropagation();dragStopTo(e.clientY)}});
 stopHandle.addEventListener('pointerup',e=>{if(stopDrag?.id===e.pointerId)finishStopDrag()});
 stopHandle.addEventListener('pointercancel',()=>finishStopDrag(true));
 stopHandle.addEventListener('lostpointercapture',()=>finishStopDrag(true));
 // The stop overlay is a sibling of the canvas. Block native scrolling at capture
 // phase so touch gestures on either surface cannot rubber-band the page.
 function blockChartTouch(e){
  if(stopDrag||horizontalDrag||$('chartWrap').contains(e.target)){
   if(e.cancelable)e.preventDefault();
  }
 }
 function blockStopTouchStart(e){
  if(stopDrag||horizontalDrag||$('stopHandle').contains(e.target)||e.target.closest?.('.horizontal-grip')){
   if(e.cancelable)e.preventDefault();
  }
 }
 document.addEventListener('touchstart',blockStopTouchStart,{capture:true,passive:false});
 document.addEventListener('touchmove',blockChartTouch,{capture:true,passive:false});
 document.addEventListener('gesturestart',blockChartTouch,{capture:true,passive:false});
 document.addEventListener('gesturechange',blockChartTouch,{capture:true,passive:false});
 // iOS Safari may still rubber-band the document when a canvas drag reaches an edge.
 canvas.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
 canvas.addEventListener('gesturestart',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
 canvas.addEventListener('gesturechange',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
 const pointers=new Map();let gesture=null,lastAxisTap=null;
 function axisAt(x,y){if(!drawingMap)return 'pan';const r=canvas.getBoundingClientRect();if(x-r.left>=drawingMap.w-drawingMap.right)return 'price';if(y-r.top>=drawingMap.h-drawingMap.bottom-8)return 'time';return 'pan'}
 function makeGesture(p,kind=axisAt(p.x,p.y)){return{kind,x:p.x,y:p.y,pan,count:viewCount,dist:0,moved:false,range:priceRange?[...priceRange]:drawingMap?[drawingMap.lo,drawingMap.hi]:null,plotH:drawingMap?.plotH||1,dx:drawingMap?.dx||8}}
 function translatePrice(range,dy,height){const shift=dy*(range[1]-range[0])/Math.max(1,height);return[range[0]+shift,range[1]+shift]}
 function scalePrice(range,dy){const mid=(range[0]+range[1])/2,span=Math.max(2,Math.min(100000,(range[1]-range[0])*Math.exp(dy/180)));return[mid-span/2,mid+span/2]}
 canvas.addEventListener('pointerdown',e=>{
  if(stopDrag||horizontalDrag)return;if(e.button!==undefined&&e.button!==0)return;
  const line=horizontalAt(e.clientX,e.clientY),editing=horizontalLines().some(l=>l.locked===false);
  // A tap that locks/unlocks an annotation must not change the chart viewport.
  if(!line&&!editing)leaveWholeDay();
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  const p={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,p);
  if(pointers.size===1){gesture=makeGesture(p);gesture.horizontalLine=line;gesture.downAt=Date.now();}
  if(pointers.size===2){
   horizontalTap=null;leaveWholeDay();const p=[...pointers.values()];gesture=makeGesture(p[0],'pinch');
   gesture.dist=Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y));gesture.moved=true;
  }
  canvas.style.cursor=gesture.kind==='price'?'ns-resize':gesture.kind==='time'?'ew-resize':'grabbing';
 });
 canvas.addEventListener('pointermove',e=>{if(stopDrag||horizontalDrag){e.preventDefault();return;}if(!pointers.has(e.pointerId)||!gesture){const kind=axisAt(e.clientX,e.clientY);canvas.style.cursor=kind==='price'?'ns-resize':kind==='time'?'ew-resize':'default';return}e.preventDefault();if(wholeDayFit&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>3){leaveWholeDay();gesture.count=viewCount;gesture.pan=pan;if(manualPriceRange)gesture.range=[...manualPriceRange];}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2){const p=[...pointers.values()],dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);viewCount=Math.max(12,Math.min(MAX_VISIBLE_BARS,Math.round(gesture.count*gesture.dist/Math.max(10,dist))));if(gesture.range){const mid=(gesture.range[0]+gesture.range[1])/2,span=Math.max(2,Math.min(100000,(gesture.range[1]-gesture.range[0])*gesture.dist/Math.max(10,dist)));manualPriceRange=[mid-span/2,mid+span/2];}manualPan=false;pan=0;gesture.moved=true}else{const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.hypot(dx,dy)>3)gesture.moved=true;if(gesture.moved){if(gesture.kind==='price'&&gesture.range)manualPriceRange=scalePrice(gesture.range,dy);else if(gesture.kind==='time')viewCount=Math.max(12,Math.min(MAX_VISIBLE_BARS,Math.round(gesture.count*Math.exp(-dx/180))));else if(gesture.kind==='pan'){pan=gesture.pan+dx/gesture.dx;if(gesture.range)manualPriceRange=translatePrice(gesture.range,dy,gesture.plotH);manualPan=true}}}priceRange=null;selectedBar=null;requestDraw()});
 function finishPointer(e){
  if(gesture&&!gesture.moved&&drawingMap){
   const handled=Date.now()-(gesture.downAt||0)<380&&tapHorizontalCanvas(e,gesture);
   if(!handled&&(gesture.kind==='price'||gesture.kind==='time')){
    const now=Date.now();
    if(lastAxisTap&&lastAxisTap.kind===gesture.kind&&now-lastAxisTap.at<350){
     if(gesture.kind==='price'){manualPan=false;manualPriceRange=null;}else{viewCount=45;pan=0;}
     priceRange=null;lastAxisTap=null;requestDraw();
    }else lastAxisTap={kind:gesture.kind,at:now};
   }
  }else horizontalTap=null;
  pointers.delete(e.pointerId);
  if(!pointers.size){gesture=null;canvas.style.cursor='default';}
  else{gesture=makeGesture([...pointers.values()][0],'pan');gesture.moved=true;}
 }
 canvas.addEventListener('pointerup',finishPointer);canvas.addEventListener('pointercancel',()=>{pointers.clear();gesture=null;canvas.style.cursor='default'});canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId)){pointers.clear();gesture=null}});
 canvas.addEventListener('wheel',e=>{e.preventDefault();if(stopDrag||horizontalDrag)return;leaveWholeDay();if(axisAt(e.clientX,e.clientY)==='price'&&priceRange)manualPriceRange=scalePrice(priceRange,e.deltaY*.2);else viewCount=Math.max(12,Math.min(MAX_VISIBLE_BARS,viewCount+(e.deltaY>0?4:-4)));priceRange=null;requestDraw()},{passive:false});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){stop();notify('已暫停播放')}});new ResizeObserver(()=>{priceRange=null;requestDraw()}).observe($('chartWrap'));
 document.addEventListener('keydown',e=>{if(e.repeat||document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlay()}if(e.code==='ArrowRight'){e.preventDefault();stop();nextBar()}if(e.code==='KeyA')trade(1);if(e.code==='KeyD')trade(-1)});
 if(document.modelContext?.registerTool){const tool={name:'read_replay_state',description:'Read only the currently revealed replay price, time, position and profit. Does not disclose future candles.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw Error('No input fields accepted');return{time:time(currentTime()),price:currentPrice(),position,average,realized,floating:floating(),playing,mode,timeframe:tf,demo:demoMode}}};try{Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{})}catch{}}
 const landscapeViewport=matchMedia('(orientation: landscape)');
 function syncChartFullscreen(){
  const enabled=fullscreenPreferred&&landscapeViewport.matches;
  $('enterFullscreen').setAttribute('aria-pressed',String(fullscreenPreferred));
  if(enabled===chartFullscreen)return;
  finishHorizontalDrag(true);finishStopDrag(true);pointers.clear();gesture=null;horizontalTap=null;
  if(enabled)lockHorizontalLines();
  chartFullscreen=enabled;document.body.classList.toggle('chart-fullscreen',enabled);
  priceRange=null;update();
 }
 function setChartFullscreen(enabled){
  if(enabled&&(!landscapeViewport.matches||horizontalDrag||stopDrag||!rememberReady))return;
  fullscreenPreferred=!!enabled;syncChartFullscreen();rememberSelection();
  if(chartFullscreen)$('exitFullscreen').focus({preventScroll:true});
  else if(landscapeViewport.matches)$('enterFullscreen').focus({preventScroll:true});
 }
 $('enterFullscreen').onclick=()=>setChartFullscreen(true);
 $('exitFullscreen').onclick=()=>setChartFullscreen(false);
 if(landscapeViewport.addEventListener)landscapeViewport.addEventListener('change',syncChartFullscreen);
 else landscapeViewport.addListener(syncChartFullscreen);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&chartFullscreen){e.preventDefault();setChartFullscreen(false);}});
 // Reconcile iOS viewport geometry after rotation settles, without changing page zoom.
 let viewportFrame=0,viewportFollowup=0;
 function syncAppViewport(){
  cancelAnimationFrame(viewportFrame);
  viewportFrame=requestAnimationFrame(()=>{
   document.documentElement.style.setProperty('--app-height',window.innerHeight+'px');
   priceRange=null;requestDraw();
  });
 }
 function handleViewportRotation(){
  finishHorizontalDrag(true);finishStopDrag(true);
  pointers.clear();gesture=null;lastAxisTap=null;horizontalTap=null;canvas.style.cursor='default';
  const active=document.activeElement;
  if(active?.matches('input,select,textarea'))active.blur();
  update();syncAppViewport();clearTimeout(viewportFollowup);
  viewportFollowup=setTimeout(syncAppViewport,350);
 }
 window.addEventListener('resize',syncAppViewport,{passive:true});
 window.addEventListener('orientationchange',handleViewportRotation,{passive:true});
 window.addEventListener('pageshow',syncAppViewport,{passive:true});
 window.visualViewport?.addEventListener('resize',syncAppViewport,{passive:true});
 if(screen.orientation?.addEventListener)screen.orientation.addEventListener('change',handleViewportRotation);
 syncAppViewport();
 speedOptions();install(demoData(),'示範行情',true);requestAnimationFrame(tick);restoreReplay();

async function restoreReplay(){
 builtinLoading=true;update();
 for(const id of ['file','startDay','demo','builtin'])$(id).disabled=true;
 let saved=null,restored=false,failed=false;
 try{
  saved=await replayStore.read();
  const stored=saved.annotations;
  if(stored&&typeof stored==='object'&&!Array.isArray(stored)){
   for(const [key,lines] of Object.entries(stored)){
    if(!Array.isArray(lines))continue;
    horizontalBook[key]=lines.filter(l=>l&&Number.isSafeInteger(l.id)&&l.id>0&&Number.isFinite(l.price)).map(l=>({id:l.id,price:l.price,locked:l.locked!==false}));
    for(const l of horizontalBook[key])horizontalSequence=Math.max(horizontalSequence,l.id);
   }
  }
  if(saved.selection?.kind==='csv'&&saved.csv){
   const c=saved.csv,parsed=parseCSV(c.text,c.stamp,c.session);
   $('stamp').value=c.stamp;$('session').value=c.session;
   const day=parsed.rows.some(r=>date(r.t)===saved.selection.day)?saved.selection.day:date(parsed.rows[0].t);
   install(parsed.rows,c.name,false,{day});
   $('fileInfo').textContent+=' · 已從本機恢復';notify('已自動載入上次 CSV');restored=true;
  }else if(saved.selection?.kind==='demo'){restored=true;}
 }catch(err){failed=true;}
 finally{builtinLoading=false;for(const id of ['file','startDay','demo','builtin'])$(id).disabled=false;update();}
 if(!restored)await loadBuiltin(saved?.selection?.kind==='builtin'?saved.selection.day:undefined);
 rememberReady=true;fullscreenPreferred=saved?.selection?.fullscreenPreferred===true;
 if(saved?.selection?.chartType==='intraday')toggleChartType();
 syncChartFullscreen();update();
 if(failed)$('importError').textContent='無法恢復本機 CSV，請重新匯入。';
}
