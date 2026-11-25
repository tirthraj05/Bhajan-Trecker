// Your Google Apps Script web app link (all data is stored in the linked Google Sheet)
const SHEET_URL="https://script.google.com/macros/s/AKfycbxGHyTeWsDm6IsjvlLl-dOLtMyIFVCDgIXQmKT88SUMoAY41r66yjQU0QlAvAxt0LQUYg/exec";

const DEFAULT_KINDS=["Dandvat","Parikrama","Smaran Dhun","Kirtan"];
const LEGACY={"દંડવત":"Dandvat","પરિક્રમા":"Parikrama","સ્મરણ ધૂન":"Smaran Dhun","કીર્તન":"Kirtan"};
const COLL_SHEET={log:"Data",goals:"Goals",glog:"GoalLog",niyam:"Niyam"};
const HARI_TAG="@hari=";   // minutes of "Hari sathe vato" are kept inside the existing "words" column, so Code.gs needs no change
const NIYAM_FIELDS=["date","persons","santo","mahima","words","arpan","thanks","thanksTo","tratak","dhyan","smaran","sukh","updatedAt"];
let db=null,rows=[],goals=[],glog=[];
const $=id=>document.getElementById(id);
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>iso(new Date());
const unit=k=>k==="Smaran Dhun"?" min":"";
const kindLabel=k=>k==="Smaran Dhun"?"Smaran Dhun (minutes)":k;
const say=(t,c)=>{const e=$("conn");if(!e)return;e.textContent=t;e.className="conn "+(c||"")};
const show=id=>{const e=$(id);if(e)e.hidden=false};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rid=()=>Date.now()+"-"+Math.random().toString(36).slice(2,8);
const clean=s=>String(s).replace(/[;=,|]/g," ").replace(/\s+/g," ").trim();
const UN={count:{suf:"",ph:"Count",tph:"Total count",lab:""},min:{suf:" min",ph:"Minutes",tph:"Total minutes",lab:" (minutes)"},hr:{suf:" hr",ph:"Hours",tph:"Total hours",lab:" (hours)"}};
const r2=n=>Math.round(n*100)/100;
const num=(v,u)=>{const n=u==="hr"?parseFloat(v):parseInt(v,10);return isFinite(n)?r2(n):NaN};function kinds(){const s=new Set(DEFAULT_KINDS);rows.forEach(r=>s.add(r.kind));return [...s]}

/* ---------- storage: Google Sheet through Apps Script ---------- */
function sheetDb(url){
  let st={log:{},goals:{},glog:{},niyam:{}},pending=[],timer=null,busy=false,fails=0,v2=false,hasN=false,jid=0;const subs=[];
  try{const c=JSON.parse(localStorage.getItem("bhajan_cache3"));if(c&&c.log&&c.goals&&c.glog&&c.niyam)st=c}catch(e){}
  try{pending=JSON.parse(localStorage.getItem("bhajan_pending2"))||[]}catch(e){}
  const savePend=()=>{try{localStorage.setItem("bhajan_pending2",JSON.stringify(pending))}catch(e){}};
  const emit=()=>{try{localStorage.setItem("bhajan_cache3",JSON.stringify(st))}catch(e){}subs.forEach(f=>f(st))};
  const apply=(o,ops)=>{ops.forEach(op=>{if(op.del)delete o[op.c][op.id];else o[op.c][op.id]=op.d});return o};
  function jsonp(params){
    return new Promise((res,rej)=>{
      const name="__bj"+(++jid)+"_"+Date.now();
      const sc=document.createElement("script");
      const cleanup=()=>{clearTimeout(t);delete window[name];sc.remove()};
      const t=setTimeout(()=>{cleanup();rej(new Error("no reply from Google; check the link and that access is Anyone"))},20000);
      window[name]=d=>{cleanup();res(d)};
      sc.onerror=()=>{cleanup();rej(new Error("could not reach Google"))};
      const q=Object.keys(params).map(k=>k+"="+encodeURIComponent(params[k])).join("&");
      sc.src=url+"?"+(q?q+"&":"")+"callback="+name+"&t="+Date.now();
      document.head.appendChild(sc);
    });
  }
  async function viaFetch(params){
    const q=Object.keys(params).map(k=>k+"="+encodeURIComponent(params[k])).join("&");
    const r=await fetch(url+"?"+q+"&t="+Date.now());
    if(!r.ok)throw new Error("HTTP "+r.status);
    return await r.json();
  }
  async function call(params){
    try{return await jsonp(params)}
    catch(e1){
      try{return await viaFetch(params)}
      catch(e2){throw new Error(e1.message+" | "+e2.message)}
    }
  }
  async function pull(){
    const j=await call({all:1});
    if(j.error)throw new Error(j.error);
    v2=j.v===2;hasN=Array.isArray(j.niyam);
    const o={log:{},goals:{},glog:{},niyam:{}};
    (j.rows||[]).forEach(x=>{o.log[x.id]={type:x.type,kind:x.kind,count:x.count,date:x.date,createdAt:x.createdAt}});
    (j.goals||[]).forEach(x=>{o.goals[x.id]={name:x.name,start:x.start,end:x.end,targets:x.targets,createdAt:x.createdAt}});
    (j.goalLog||[]).forEach(x=>{o.glog[x.id]={goalId:x.goalId,date:x.date,kind:x.kind,count:x.count,createdAt:x.createdAt}});
    (j.niyam||[]).forEach(x=>{const d={};NIYAM_FIELDS.forEach(k=>d[k]=x[k]);o.niyam[x.id]=d});
    return o;
  }
  function formPost(body){
    const n="f"+Date.now(),fr=document.createElement("iframe"),f=document.createElement("form"),ta=document.createElement("textarea");
    fr.name=n;fr.style.display="none";f.method="POST";f.action=url;f.target=n;f.style.display="none";ta.name="p";ta.value=body;f.appendChild(ta);
    document.body.append(fr,f);f.submit();setTimeout(()=>{fr.remove();f.remove()},30000);
  }
  async function post(wire){
    const body=JSON.stringify({ops:wire});
    try{await fetch(url,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body})}
    catch(e){formPost(body)}
  }
  const sameN=(a,b)=>NIYAM_FIELDS.every(k=>String(a[k]==null?"":a[k])===String(b[k]==null?"":b[k]));
  async function flush(){
    if(busy||!pending.length)return;
    busy=true;say("Saving…");
    const ops=pending.slice();
    try{
      const wire=ops.map(op=>op.del?{s:COLL_SHEET[op.c],id:op.id,del:1}:{s:COLL_SHEET[op.c],id:op.id,d:op.d});
      const big=encodeURIComponent(JSON.stringify(wire)).length>1700;
      if(big&&fails<2)await post(wire);
      else{
        const chunks=[];let cur=[];
        wire.forEach(op=>{const t=[...cur,op];if(cur.length&&encodeURIComponent(JSON.stringify(t)).length>1700){chunks.push(cur);cur=[op]}else cur=t});
        if(cur.length)chunks.push(cur);
        for(const c of chunks){const j=await call({ops:JSON.stringify(c)});if(!j.ok)throw new Error(j.error||"Sheet error")}
      }
      const last={};ops.forEach(op=>last[op.c+"/"+op.id]=op);
      let o=null,ok=false;
      for(let t=0;t<5&&!ok;t++){
        await sleep(800);
        o=await pull();
        ok=Object.values(last).every(op=>op.del?!o[op.c][op.id]:(op.c==="niyam"?(o.niyam[op.id]&&sameN(o.niyam[op.id],op.d)):!!o[op.c][op.id]));
      }
      if(!ok)throw new Error("the Sheet did not receive the data");
      pending=pending.slice(ops.length);savePend();
      st=apply(o,pending);emit();fails=0;busy=false;
      say("Saved to Google Sheet ✓","ok");
      if(pending.length)sched();
    }catch(e){
      busy=false;fails++;
      say("Not saved yet: "+e.message+". Retrying…","err");
      if(fails<=5)setTimeout(flush,4000*fails);
    }
  }
  const sched=()=>{clearTimeout(timer);timer=setTimeout(flush,700)};
  const guard=c=>{
    if(c==="niyam"){if(!hasN){show("nwarn");return false}return true}
    if(c!=="log"&&!v2){show("gwarn");return false}
    return true;
  };
  return {
    subscribe:f=>{subs.push(f);f(st)},
    set:(c,id,d)=>{if(!guard(c))return false;st[c][id]=d;pending.push({c,id,d});savePend();emit();sched();return true},
    del:(c,id)=>{if(!guard(c))return false;delete st[c][id];pending.push({c,id,del:1});savePend();emit();sched();return true},
    load:async()=>{const o=await pull();if(!busy){st=apply(o,pending);emit()}},
    flush:()=>{fails=0;return flush()},
    start:()=>{if(pending.length)sched()},
    pendingCount:()=>pending.length,
    isV2:()=>v2,
    isN:()=>hasN
  };
}

/* ---------- parse sheet data ---------- */
function parseState(st){
  rows=Object.keys(st.log).map(id=>({id,...st.log[id],kind:LEGACY[st.log[id].kind]||st.log[id].kind})).filter(r=>r.type==="entry"||r.type==="arpan");
  goals=Object.keys(st.goals).map(id=>{
    const d=st.goals[id],g={id,name:d.name||"",start:d.start,end:d.end,targets:{},units:{}};
    String(d.targets||"").split(";").forEach(p=>{
      const i=p.indexOf("=");if(i<1)return;
      const k=p.slice(0,i).trim(),rest=p.slice(i+1).split("|"),uu=(rest[1]||"").trim();
      const u=UN[uu]?uu:(k==="Smaran Dhun"?"min":"count"),n=num(rest[0],u);
      if(n>0){g.targets[k]=n;g.units[k]=u}
    });
    return g.start&&g.end&&Object.keys(g.targets).length?g:null;
  }).filter(Boolean);
  glog=Object.keys(st.glog).map(id=>({id,...st.glog[id]}));
}

/* ---------- goals ---------- */
const dd=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const gKinds=g=>Object.keys(g.targets);
const gu=(g,k)=>UN[g.units[k]||"count"];
const prog=(g,k)=>r2(glog.filter(x=>x.goalId===g.id&&x.kind===k).reduce((a,x)=>a+x.count,0));
const perDay=(rem,left,u)=>{const q=u==="hr"?4:1;return Math.ceil(rem/Math.max(left,1)*q)/q};
const isDone=g=>gKinds(g).every(k=>prog(g,k)>=g.targets[k]);
const clamp=g=>{const t=today();return t<g.start?g.start:t>g.end?g.end:t};
let gDate={},gOpen=new Set(),gExtra=[];

const isActive=g=>{const t=today();return t>=g.start&&t<=g.end};

function renderGoals(G,list,o){
  const keep={};G.querySelectorAll("input[data-g]").forEach(i=>keep[i.dataset.g+"|"+i.dataset.k]=i.value);
  G.innerHTML="";
  if(!list.length){G.innerHTML='<div class="card"><p class="mute" style="margin:0">'+(o.empty||"No goal yet.")+'</p></div>';return}
  const t=today();
  [...list].sort((a,b)=>b.start.localeCompare(a.start)).forEach(g=>{
    const ks=gKinds(g),done=isDone(g),days=dd(g.start,g.end)+1;
    const left=t>g.end?0:(t<g.start?days:dd(t,g.end)+1);
    const card=document.createElement("section");card.className="card";

    const head=document.createElement("div");head.className="gh";
    const info=document.createElement("div");
    const h=document.createElement("h3");h.textContent=g.name||"Goal";
    const sub=document.createElement("div");sub.className="mute";
    sub.textContent=g.start+" to "+g.end+" · "+(t<g.start?"starts in "+dd(t,g.start)+" days":t>g.end?"period ended":"day "+(dd(g.start,t)+1)+" of "+days+" · "+left+" days left");
    info.append(h,sub);
    const x=document.createElement("button");x.textContent="✕";x.title="Delete goal";
    x.onclick=()=>{if(confirm("Delete this goal and all its entries?")){glog.filter(e=>e.goalId===g.id).forEach(e=>db.del("glog",e.id));db.del("goals",g.id)}};
    head.append(info);if(o.admin)head.append(x);card.appendChild(head);

    let met=0;
    ks.forEach(k=>{
      const tg=g.targets[k],got=prog(g,k),rem=r2(Math.max(0,tg-got)),U=gu(g,k);
      if(rem===0)met++;
      const line=document.createElement("div");line.className="gk";
      const a=document.createElement("span");a.textContent=k;
      const b=document.createElement("b");b.textContent=got+" / "+tg+U.suf;
      line.append(a,b);
      const pb=document.createElement("div");pb.className="pb"+(rem===0?" done":"");
      const bar=document.createElement("i");bar.style.width=Math.min(100,Math.round(got/tg*100))+"%";pb.appendChild(bar);
      const note=document.createElement("div");note.className="mute";
      note.textContent=rem===0?"Target completed":(t>g.end?"Missed by "+rem+U.suf:"Remaining "+rem+U.suf+(t>=g.start?" · about "+perDay(rem,left,g.units[k])+U.suf+" per day":""));
      card.append(line,pb,note);
    });
    if(done){const c=document.createElement("div");c.className="congrats";c.textContent="Congratulations! You completed all your targets.";card.appendChild(c)}
    else if(t>g.end){const c=document.createElement("div");c.className="ended";c.textContent="Period ended. "+met+" of "+ks.length+" targets completed.";card.appendChild(c)}

    const f=document.createElement("div");f.className="gf";
    const fh=document.createElement("h4");fh.textContent="Add entry for this goal";f.appendChild(fh);
    const dl=document.createElement("label");dl.textContent="Date";
    const di=document.createElement("input");di.type="date";di.min=g.start;di.max=g.end;di.value=gDate[g.id]||clamp(g);
    di.onchange=()=>{gDate[g.id]=di.value};
    f.append(dl,di);
    const inputs=[];
    ks.forEach(k=>{
      const l=document.createElement("label");l.textContent=k+gu(g,k).lab;
      const i=document.createElement("input");i.type="number";i.min="0";i.inputMode="decimal";
      i.step=g.units[k]==="hr"?"0.25":"1";i.placeholder=gu(g,k).ph;i.dataset.g=g.id;i.dataset.k=k;i.value=keep[g.id+"|"+k]||"";
      inputs.push(i);f.append(l,i);
    });
    const sb=document.createElement("button");sb.className="btn";sb.textContent="Save Entry";
    sb.onclick=()=>saveGoalEntry(g,di,inputs);
    f.appendChild(sb);if(o.form!==false)card.appendChild(f);

    const mine=glog.filter(e=>e.goalId===g.id).sort((a,b)=>(b.date+(b.createdAt||"")).localeCompare(a.date+(a.createdAt||"")));
    const det=document.createElement("details");det.open=gOpen.has(g.id);
    const sm=document.createElement("summary");sm.textContent="Entries ("+mine.length+")";det.appendChild(sm);
    mine.forEach(e=>{
      const d=document.createElement("div");d.className="h";
      const s=document.createElement("span");s.textContent=e.date+" · "+e.kind+" +"+e.count+gu(g,e.kind).suf;
      const xb=document.createElement("button");xb.textContent="✕";xb.title="Delete";
      xb.onclick=()=>{if(confirm("Delete this entry?"))db.del("glog",e.id)};
      d.append(s,xb);det.appendChild(d);
    });
    det.ontoggle=()=>{if(det.open)gOpen.add(g.id);else gOpen.delete(g.id)};
    card.appendChild(det);
    G.appendChild(card);
  });
}

function saveGoalEntry(g,di,inputs){
  if(!db)return alert("Not connected yet");
  const date=di.value;
  if(!date||date<g.start||date>g.end)return alert("Pick a date between "+g.start+" and "+g.end);
  const items=inputs.map(i=>({k:i.dataset.k,c:num(i.value,g.units[i.dataset.k])})).filter(x=>x.c>0);
  if(!items.length)return alert("Enter a count for at least one item");
  const was=isDone(g);
  inputs.forEach(i=>i.value="");
  for(const x of items){
    if(!db.set("glog","l"+rid(),{goalId:g.id,date,kind:x.k,count:x.c,createdAt:new Date().toISOString()}))return;
  }
  const g2=goals.find(z=>z.id===g.id);
  if(g2&&!was&&isDone(g2))alert("Congratulations! You completed your goal"+(g2.name?" \""+g2.name+"\"":"")+".");
}

/* ---------- niyam shared ---------- */
// ===== You can change these =====
const NIYAM_PERSONS=["","","","",""];                       // names of the 5 mansi (leave "" to show only 1-5)
const SANTO=[{name:"જ્ઞાનજીવનદાસજી (ગુરુજી)",img:"snato/sant_01_guruji.jpg"},{name:"નારાયણમુનિદાસજી",img:"snato/sant_02.jpg"},{name:"ધર્મસ્વરૂપદાસજી",img:"snato/sant_03.jpg"},{name:"નિર્મળદાસજી",img:"snato/sant_04.jpg"},{name:"શ્યામચરણદાસજી",img:"snato/sant_05.jpg"},{name:"ઈશ્વરચરણદાસજી",img:"snato/sant_06.jpg"},{name:"નંદકિશોરદાસજી",img:"snato/sant_07.jpg"},{name:"ઘનશ્યામજીવનદાસજી",img:"snato/sant_08.jpg"},{name:"અક્ષરજીવનદાસજી",img:"snato/sant_09.jpg"},{name:"અચ્યુતદાસજી",img:"snato/sant_10.jpg"},{name:"સરજુદાસજી",img:"snato/sant_11.jpg"},{name:"માધવપ્રિયદાસજી",img:"snato/sant_12.jpg"},{name:"નિરંજનદાસજી",img:"snato/sant_13.jpg"},{name:"વિવેકસ્વરૂપદાસજી",img:"snato/sant_14.jpg"},{name:"કૃષ્ણપ્રિયદાસજી",img:"snato/sant_15.jpg"},{name:"શ્રીરંગદાસજી",img:"snato/sant_16.jpg"},{name:"પવિત્રજીવનદાસજી",img:"snato/sant_17.jpg"},{name:"ત્યાગવલ્લભદાસજી",img:"snato/sant_18.jpg"},{name:"સાધુજીવનદાસજી",img:"snato/sant_19.jpg"},{name:"અખિલજીવનદાસજી",img:"snato/sant_20.jpg"},{name:"ભજનપ્રકાશદાસજી",img:"snato/sant_21.jpg"},{name:"સનાતનદાસજી",img:"snato/sant_22.jpg"},{name:"સંતદાસજી",img:"snato/sant_23.jpg"},{name:"ન્યાલકરણદાસજી",img:"snato/sant_24.jpg"},{name:"વિદેહસ્વરૂપદાસજી",img:"snato/sant_25.jpg"},{name:"મંગળસ્વરૂપદાસજી",img:"snato/sant_26.jpg"},{name:"અચલસ્વરૂપદાસજી",img:"snato/sant_27.jpg"},{name:"પુરાતનદાસજી",img:"snato/sant_28.jpg"},{name:"રામદાસજી",img:"snato/sant_29.jpg"},{name:"ઉત્તમચરણદાસજી",img:"snato/sant_30.jpg"},{name:"શ્રીજીસ્વરૂપદાસજી",img:"snato/sant_31.jpg"},{name:"સાકારસ્વરૂપદાસજી",img:"snato/sant_32.jpg"},{name:"આનંદસ્વરૂપદાસજી",img:"snato/sant_33.jpg"},{name:"સદ્રુચિદાસજી",img:"snato/sant_34.jpg"},{name:"અનુવૃત્તિદાસજી",img:"snato/sant_35.jpg"},{name:"વર્ણિવેષદાસજી",img:"snato/sant_36.jpg"},{name:"અનાદિસ્વરૂપદાસજી",img:"snato/sant_37.jpg"},{name:"કારણસ્વરૂપદાસજી",img:"snato/sant_38.jpg"},{name:"આદર્શજીવનદાસજી",img:"snato/sant_39.jpg"},{name:"સદ્ગુણસ્વરૂપદાસજી",img:"snato/sant_40.jpg"},{name:"પ્રસન્નવદનદાસજી",img:"snato/sant_41.jpg"},{name:"ચિન્મયસ્વરૂપદાસજી",img:"snato/sant_42.jpg"},{name:"પ્રત્યક્ષસ્વરૂપદાસજી",img:"snato/sant_43.jpg"},{name:"પરસ્વરૂપદાસજી",img:"snato/sant_44.jpg"},{name:"સંકીર્તનદાસજી",img:"snato/sant_45.jpg"},{name:"અન્વયસ્વરૂપદાસજી",img:"snato/sant_46.jpg"},{name:"હૃદયપ્રકાશદાસજી",img:"snato/sant_47.jpg"},{name:"ઐશ્વર્યપ્રકાશદાસજી",img:"snato/sant_48.jpg"},{name:"હરિગુણદાસજી",img:"snato/sant_49.jpg"},{name:"આત્મીયસ્વરૂપદાસજી",img:"snato/sant_50.jpg"},{name:"મૂર્તિસ્વરૂપદાસજી",img:"snato/sant_51.jpg"},{name:"સહનપ્રિયદાસજી",img:"snato/sant_52.jpg"},{name:"ચતુરભગત",img:"snato/parshad_01.jpg"},{name:"ગિરીશભગત",img:"snato/parshad_02.jpg"},{name:"જયંતિભગત",img:"snato/parshad_03.jpg"},{name:"ધરમભગત",img:"snato/parshad_04.jpg"},{name:"વિનયભગત",img:"snato/parshad_05.jpg"},{name:"પ્રફુલભગત",img:"snato/parshad_06.jpg"},{name:"ધનશ્યામભગત",img:"snato/parshad_07.jpg"},{name:"ધનજીભગત",img:"snato/parshad_08.jpg"},{name:"રાધેશભગત",img:"snato/parshad_09.jpg"}];   // photos are in the snato/ folder; change a name here if it is wrong
const MAHIMA_WORDS=["Sharir – Shariri","Swami – Sevak","Shesh – Sheshi"];
// ================================
const nh=(t,a,...c)=>{const e=document.createElement(t);if(a)for(const k in a){const v=a[k];if(k==="class")e.className=v;else if(k.startsWith("on"))e[k]=v;else if(k==="style")e.style.cssText=v;else if(v!=null)e.setAttribute(k,v)}c.flat().forEach(x=>{if(x==null||x===false)return;e.append(x.nodeType?x:document.createTextNode(x))});return e};
const NY={map:{},date:today(),cur:null,dirty:false,timer:null,loaded:"",celebrated:false,q:""};
const nyBlank=()=>({persons:[0,0,0,0,0],santo:{},mahima:"",words:[],arpan:"",thanks:"",thanksTo:"",tratak:0,dhyan:0,smaran:"",hari:"",sukh:""});
function nyParse(d){
  const c=nyBlank();if(!d)return c;
  const ps=String(d.persons||"").split(",").map(x=>parseInt(x,10)||0);for(let i=0;i<5;i++)c.persons[i]=Math.max(0,Math.min(5,ps[i]||0));
  try{const o=JSON.parse(d.santo||"{}");if(o&&typeof o==="object"&&!Array.isArray(o))c.santo=o}catch(e){}
  try{const w=JSON.parse(d.words||"[]");if(Array.isArray(w))w.forEach(x=>{x=String(x);if(x.startsWith(HARI_TAG))c.hari=String(Math.max(0,Math.min(1440,parseInt(x.slice(HARI_TAG.length),10)||0)));else c.words.push(x)})}catch(e){}
  c.mahima=d.mahima==="Y"||d.mahima==="N"?d.mahima:"";c.arpan=d.arpan==="Y"||d.arpan==="N"?d.arpan:"";c.thanks=d.thanks==="Y"||d.thanks==="N"?d.thanks:"";
  c.thanksTo=String(d.thanksTo||"");c.tratak=parseInt(d.tratak,10)||0;c.dhyan=parseInt(d.dhyan,10)||0;
  c.smaran=d.smaran===""||d.smaran==null?"":String(Math.max(0,Math.min(100,parseInt(d.smaran,10)||0)));c.sukh=String(d.sukh||"");
  return c;
}
const nyDoc=c=>({date:NY.date,persons:c.persons.join(","),santo:JSON.stringify(c.santo),mahima:c.mahima,words:JSON.stringify(c.hari!==""?[...c.words,HARI_TAG+c.hari]:c.words),arpan:c.arpan,thanks:c.thanks,thanksTo:c.thanksTo,tratak:c.tratak?String(c.tratak):"",dhyan:c.dhyan?String(c.dhyan):"",smaran:String(c.smaran),sukh:c.sukh,updatedAt:Date.now()});
const nyEmpty=c=>JSON.stringify(c)===JSON.stringify(nyBlank());
const nyKey=c=>JSON.stringify(c);
function nyDone(c){return [c.persons.every(x=>x>0),Object.keys(c.santo).length>0,c.mahima!=="",c.arpan!=="",c.thanks!=="",c.tratak>0,c.dhyan>0,c.smaran!=="",c.hari!=="",c.sukh.trim()!==""]}
