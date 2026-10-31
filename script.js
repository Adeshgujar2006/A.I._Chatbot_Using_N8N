const CFG = Object.assign({WEBHOOK_URL:"",TIMEOUT_MS:60000}, window.APP_CONFIG||{});
const $ = s => document.querySelector(s);
const WELCOME = "Hi! How can I help you today?";
const KEY = "n8n-chat-v1";
let state = load();
let busy = false;

function load(){
  try{ const s = JSON.parse(localStorage.getItem(KEY)); if(s&&s.chats) return s; }catch(e){}
  return {chats:[], current:null, theme:matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"};
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(36).slice(2));
const cur = () => state.chats.find(c=>c.id===state.current);

function newChat(){
  const c = cur();
  if(c && !c.messages.length){ closeSide(); return; }   // reuse empty chat
  const chat = {id:uid(), title:"New chat", messages:[]};
  state.chats.unshift(chat); state.current = chat.id; save(); render(); closeSide(); $("#in").focus();
}
function openChat(id){ if(busy) return; state.current=id; save(); render(); closeSide(); }
function delChat(id){
  if(busy) return;
  state.chats = state.chats.filter(c=>c.id!==id);
  if(state.current===id) state.current = state.chats[0]?.id || null;
  if(!state.current) return newChat();
  save(); render();
}

function esc(s){ return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function md(src){   // small safe Markdown renderer (escapes HTML first)
  const blocks=[]; let t = esc(src).replace(/```(\w*)\n?([\s\S]*?)(```|$)/g,(_,l,c)=>{blocks.push(`<pre><code>${c.replace(/\n$/,"")}</code></pre>`);return `\u0000${blocks.length-1}\u0000`;});
  t = t.replace(/`([^`\n]+)`/g,"<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>")
       .replace(/(^|[\s(])\*([^*\n]+)\*/g,"$1<em>$2</em>")
       .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out=[]; let list=null;
  for(const line of t.split("\n")){
    const ul=line.match(/^\s*[-*]\s+(.*)/), ol=line.match(/^\s*\d+\.\s+(.*)/), h=line.match(/^#{1,6}\s+(.*)/);
    const kind = ul?"ul":ol?"ol":null;
    if(list && list!==kind){ out.push(`</${list}>`); list=null; }
    if(kind){ if(!list){ out.push(`<${kind}>`); list=kind; } out.push(`<li>${(ul||ol)[1]}</li>`); }
    else if(h) out.push(`<p><strong>${h[1]}</strong></p>`);
    else if(line.trim()) out.push(`<p>${line}</p>`);
  }
  if(list) out.push(`</${list}>`);
  return out.join("").replace(/\u0000(\d+)\u0000/g,(_,i)=>blocks[i]).replace(/<p>(<pre>[\s\S]*?<\/pre>)<\/p>/g,"$1");
}

function bubble(role, text){
  const row = document.createElement("div");
  row.className = "row "+(role==="user"?"user":role==="error"?"bot err":"bot");
  if(role!=="user") row.innerHTML = '<div class="av">AI</div>';
  const b = document.createElement("div"); b.className="b";
  setBubble(b, role, text); row.appendChild(b);
  if(role==="assistant"){
    const cp=document.createElement("button"); cp.className="cp"; cp.textContent="Copy"; cp.setAttribute("aria-label","Copy reply");
    cp.onclick=async()=>{ try{ await navigator.clipboard.writeText(b.innerText); cp.textContent="Copied"; }catch(e){ cp.textContent="Failed"; } setTimeout(()=>cp.textContent="Copy",1500); };
    row.appendChild(cp);
  } $("#msgs").appendChild(row); return b;
}
function setBubble(b, role, text){ if(role==="user") b.textContent=text; else b.innerHTML = md(text); }
function scroll(){ const c=$("#chat"); c.scrollTop=c.scrollHeight; }

function render(){
  if(!state.current || !cur()){ state.chats.length ? state.current=state.chats[0].id : null; }
  if(!cur()){ const chat={id:uid(),title:"New chat",messages:[]}; state.chats.unshift(chat); state.current=chat.id; }
  $("#msgs").innerHTML = ""; bubble("assistant", WELCOME);
  if(!cur().messages.length){
    const ch=document.createElement("div"); ch.className="chips";
    ["Explain something simply","Write a professional email","Give me project ideas","Help me plan my day"].forEach(t=>{
      const b=document.createElement("button"); b.className="chip"; b.textContent=t;
      b.onclick=()=>{ if(busy) return; $("#in").value=t; send(); }; ch.appendChild(b);
    });
    $("#msgs").appendChild(ch);
  }
  cur().messages.forEach(m=>bubble(m.role,m.content));
  $("#title").textContent = cur().title;
  const list=$("#list"); list.innerHTML="";
  state.chats.forEach(c=>{
    const d=document.createElement("div"); d.className="item"+(c.id===state.current?" on":"");
    const t=document.createElement("button"); t.className="t"; t.textContent=c.title; t.onclick=()=>openChat(c.id);
    const x=document.createElement("button"); x.className="x"; x.textContent="✕"; x.setAttribute("aria-label","Delete chat"); x.onclick=()=>delChat(c.id);
    d.append(t,x); list.appendChild(d);
  });
  document.documentElement.dataset.theme = state.theme; save(); scroll();
}

// Read n8n response: streaming NDJSON ({type:"item",content}) or plain JSON ({output}).
async function ask(chat, text, onToken, signal){
  if(!CFG.WEBHOOK_URL || CFG.WEBHOOK_URL.includes("YOUR-N8N-HOST")) throw new Error("Webhook URL is not set. Edit config.js.");
  const res = await fetch(CFG.WEBHOOK_URL,{method:"POST",signal,headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"sendMessage",sessionId:chat.id,chatInput:text})});
  if(!res.ok) throw new Error(`Server returned ${res.status}. Check the workflow is active and the origin is allowed.`);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf="", full="", raw="";
  const handle = line=>{
    line=line.trim(); if(!line) return;
    let j; try{ j=JSON.parse(line); }catch(e){ return; }
    if(j.type==="item" && typeof j.content==="string"){ full+=j.content; onToken(full); }
    else if(j.type==="error") throw new Error(j.content||"The workflow reported an error.");
    else if(typeof (j.output??j.text??j.message)==="string" && !j.type){ full=j.output??j.text??j.message; onToken(full); }
  };
  for(;;){
    const {done,value}=await reader.read(); if(done) break;
    const chunk=dec.decode(value,{stream:true}); raw+=chunk; buf+=chunk;
    const parts=buf.split("\n"); buf=parts.pop(); parts.forEach(handle);
  }
  handle(buf);
  if(!full){ try{ const j=JSON.parse(raw); full=j.output??j.text??""; }catch(e){} if(full) onToken(full); }
  if(!full) throw new Error("The assistant returned an empty response.");
  return full;
}

async function send(){
  const input=$("#in"), text=input.value.trim();
  if(!text || busy) return;
  document.querySelector(".chips")?.remove(); const chat=cur(); busy=true; $("#send").disabled=true; input.value=""; input.style.height="auto";
  chat.messages.push({role:"user",content:text});
  if(chat.title==="New chat"){ chat.title=text.length>36?text.slice(0,36)+"…":text; }
  bubble("user",text);
  const b=bubble("assistant",""); b.innerHTML='<span class="dots"><i></i><i></i><i></i></span>'; scroll();
  const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),CFG.TIMEOUT_MS);
  try{
    const reply=await ask(chat,text,t=>{ setBubble(b,"assistant",t); scroll(); },ctl.signal);
    chat.messages.push({role:"assistant",content:reply});
  }catch(e){
    const msg = e.name==="AbortError" ? "The request timed out. Please try again."
      : e instanceof TypeError ? "Can't reach the server. Check your connection and the CORS allowed origins in n8n."
      : e.message;
    b.parentElement.remove(); bubble("error",msg);
  }finally{
    clearTimeout(timer); busy=false; $("#send").disabled=!input.value.trim(); save(); render(); input.focus();
  }
}

function closeSide(){ $("#side").classList.remove("open"); $("#scrim").classList.remove("open"); }
$("#menu").onclick=()=>{ $("#side").classList.add("open"); $("#scrim").classList.add("open"); };
$("#scrim").onclick=closeSide;
$("#new").onclick=newChat;
$("#theme").onclick=()=>{ state.theme=state.theme==="dark"?"light":"dark"; document.documentElement.dataset.theme=state.theme; save(); };
$("#send").onclick=send;
$("#in").addEventListener("input",e=>{ e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,180)+"px"; $("#send").disabled=busy||!e.target.value.trim(); });
$("#in").addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); send(); } });
$("#send").disabled=true;
render();
