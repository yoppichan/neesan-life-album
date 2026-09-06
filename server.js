import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.resolve("data");
const DB = path.join(DATA_DIR, "events.json");
const PUBLIC = path.resolve("public");
const MCP_TOKEN = process.env.MCP_TOKEN || "";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

async function readEvents() {
  try { return JSON.parse(await fs.readFile(DB, "utf8")); } catch { return []; }
}
async function writeEvents(events) {
  await fs.mkdir(DATA_DIR,{recursive:true});
  await fs.writeFile(DB, JSON.stringify(events,null,2), "utf8");
}
function normalizeEvent(x) {
  return {id:x.id||crypto.randomUUID(),occurred_at:x.occurred_at||new Date().toISOString(),
    title:String(x.title||"出来事").slice(0,120),detail:String(x.detail||"").slice(0,1000),
    tags:Array.isArray(x.tags)?x.tags.map(String).slice(0,12):[],
    people:Array.isArray(x.people)?x.people.map(String).slice(0,12):[],
    pets:Array.isArray(x.pets)?x.pets.map(String).slice(0,12):[],source:x.source||"chat"};
}
const fallbackExtract=(text)=>{const tags=[];for(const [t,re] of [["ふくちゃん",/ふくちゃん/],["散歩",/散歩|さんぽ/],["サウナ",/サウナ/],["昼寝",/昼寝|ひるね/],["食事",/食べた|食った|ご飯|朝飯|昼飯|晩飯/],["買い物",/買った|買い物|購入/],["帰宅",/ただいま|帰ってきた|帰宅/]])if(re.test(text))tags.push(t);return [{title:text.length>50?text.slice(0,50)+"…":text,detail:text,tags,people:[],pets:/ふくちゃん/.test(text)?["ふくちゃん"]:[],occurred_at:new Date().toISOString(),source:"chat"}]};
async function aiExtract(text) {
  const key=process.env.OPENAI_API_KEY;if(!key)return fallbackExtract(text);
  const model=process.env.OPENAI_MODEL||"gpt-5.6";
  const body={model,input:[
    {role:"system",content:"あなたは生活ログ整理係。ユーザーの発言から実際に起きた生活上の出来事だけを抽出。推測・創作禁止。未来の予定は保存しない。日本語で構造化JSONのみ。"},
    {role:"user",content:text}],text:{format:{type:"json_schema",name:"life_events",strict:true,schema:{type:"object",additionalProperties:false,properties:{events:{type:"array",items:{type:"object",additionalProperties:false,properties:{title:{type:"string"},detail:{type:"string"},tags:{type:"array",items:{type:"string"}},people:{type:"array",items:{type:"string"}},pets:{type:"array",items:{type:"string"}},occurred_at:{type:"string"},source:{type:"string"}},required:["title","detail","tags","people","pets","occurred_at","source"]}}},required:["events"]}}}};
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`OpenAI API ${r.status}`);const j=await r.json();return JSON.parse(j.output_text||"").events||[];
}
async function body(req){let b="";for await(const c of req)b+=c;if(b.length>2e6)throw new Error("body too large");return b?JSON.parse(b):{}}
function send(res,status,obj,headers={}){const data=typeof obj==="string"?obj:JSON.stringify(obj);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":CORS_ORIGIN,"Access-Control-Allow-Headers":"Content-Type",...headers});res.end(data)}
async function router(req,res){
  if(req.method==="OPTIONS"){res.writeHead(204,{"Access-Control-Allow-Origin":CORS_ORIGIN,"Access-Control-Allow-Headers":"Content-Type"});return res.end()}
  const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
  try{
    if(u.pathname==="/api/health")return send(res,200,{ok:true,app:"ねーさん生活アルバム",version:"2.0.0",ai:!!process.env.OPENAI_API_KEY,mcp_auth:!!MCP_TOKEN});
    if(u.pathname==="/api/extract"&&req.method==="POST"){const x=await body(req),text=String(x.text||"").trim();if(!text)return send(res,400,{error:"text required"});return send(res,200,{events:(await aiExtract(text)).map(normalizeEvent)})}
    if(u.pathname==="/api/events"&&req.method==="POST"){const x=await body(req),inc=Array.isArray(x.events)?x.events:[x],clean=inc.filter(Boolean).map(normalizeEvent),all=await readEvents();all.push(...clean);await writeEvents(all);return send(res,200,{events:clean})}
    if(u.pathname==="/api/events"&&req.method==="GET"){const all=await readEvents(),q=(u.searchParams.get("q")||"").toLowerCase();const out=(q?all.filter(e=>JSON.stringify(e).toLowerCase().includes(q)):all).sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at));return send(res,200,out)}
    if(u.pathname==="/api/events"&&req.method==="DELETE"){await writeEvents([]);return send(res,200,{ok:true})}
    if(u.pathname==="/api/events/range"&&req.method==="GET"){
      const all=await readEvents();
      const from=u.searchParams.get("from")||"0000-01-01T00:00:00.000Z";
      const to=u.searchParams.get("to")||"9999-12-31T23:59:59.999Z";
      const q=(u.searchParams.get("q")||"").toLowerCase();
      const out=all.filter(e=>{const d=new Date(e.occurred_at);return d>=new Date(from)&&d<=new Date(to)&&(!q||JSON.stringify(e).toLowerCase().includes(q));}).sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at));
      return send(res,200,out);
    }
    if(u.pathname.startsWith("/api/events/")&&req.method==="DELETE"){const id=u.pathname.split("/").pop(),all=await readEvents();await writeEvents(all.filter(e=>e.id!==id));return send(res,200,{ok:true})}
    if(u.pathname==="/mcp"&&req.method==="POST"){
      if(MCP_TOKEN && req.headers.authorization !== `Bearer ${MCP_TOKEN}`) return send(res,401,{error:"unauthorized"});
      const m=await body(req),id=m.id??null,reply=x=>send(res,200,{jsonrpc:"2.0",id,result:x}),err=(c,msg)=>send(res,200,{jsonrpc:"2.0",id,error:{code:c,message:msg}});
      if(m.method==="initialize")return reply({protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"neesan-life-album",version:"1.0.0"}});
      if(m.method==="notifications/initialized"){res.writeHead(202);return res.end()}
      if(m.method==="tools/list")return reply({tools:[
        {name:"record_life_event",description:"Save a real-life event into the life album.",inputSchema:{type:"object",properties:{title:{type:"string"},detail:{type:"string"},occurred_at:{type:"string"},tags:{type:"array",items:{type:"string"}},people:{type:"array",items:{type:"string"}},pets:{type:"array",items:{type:"string"}}},required:["title","detail"]}},
        {name:"search_life_album",description:"Search saved life events by words, tags, people, or pets.",inputSchema:{type:"object",properties:{query:{type:"string"}}}},
        {name:"recent_life_events",description:"Return recent saved life events.",inputSchema:{type:"object",properties:{limit:{type:"integer"}}}},
        {name:"life_events_in_range",description:"Return saved life events between ISO dates, optionally filtered by query.",inputSchema:{type:"object",properties:{from:{type:"string"},to:{type:"string"},query:{type:"string"}}}}
      ]});
      if(m.method==="tools/call"){const n=m.params?.name,a=m.params?.arguments||{},all=await readEvents();if(n==="record_life_event"){const e=normalizeEvent({...a,source:"chat"});
          const duplicate=all.find(x=>x.title===e.title && x.detail===e.detail && Math.abs(new Date(x.occurred_at)-new Date(e.occurred_at))<120000);
          if(!duplicate){all.push(e);await writeEvents(all);}
          const saved=duplicate||e;
          return reply({content:[{type:"text",text:JSON.stringify(saved)}],structuredContent:{event:saved,duplicate:!!duplicate}})}if(n==="search_life_album"){const q=String(a.query||"").toLowerCase(),o=all.filter(e=>!q||JSON.stringify(e).toLowerCase().includes(q)).sort((x,y)=>new Date(y.occurred_at)-new Date(x.occurred_at)).slice(0,50);return reply({content:[{type:"text",text:JSON.stringify(o)}],structuredContent:{events:o}})}if(n==="recent_life_events"){const lim=Math.min(Math.max(Number(a.limit)||10,1),50),o=all.sort((x,y)=>new Date(y.occurred_at)-new Date(x.occurred_at)).slice(0,lim);return reply({content:[{type:"text",text:JSON.stringify(o)}],structuredContent:{events:o}})}if(n==="life_events_in_range"){const from=new Date(a.from||"0000-01-01T00:00:00.000Z"),to=new Date(a.to||"9999-12-31T23:59:59.999Z"),q=String(a.query||"").toLowerCase(),o=all.filter(e=>{const d=new Date(e.occurred_at);return d>=from&&d<=to&&(!q||JSON.stringify(e).toLowerCase().includes(q));}).sort((x,y)=>new Date(y.occurred_at)-new Date(x.occurred_at)).slice(0,200);return reply({content:[{type:"text",text:JSON.stringify(o)}],structuredContent:{events:o}})}return err(-32601,`Unknown tool: ${n}`)}
      return err(-32601,`Unknown method: ${m.method}`)
    }
    // static files
    let p=u.pathname==="/" ? "/index.html" : u.pathname;
    const file=path.join(PUBLIC,path.normalize(p)); if(!file.startsWith(PUBLIC))return send(res,403,{error:"forbidden"});
    const data=await fs.readFile(file);const ext=path.extname(file);const ct={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".webmanifest":"application/manifest+json",".css":"text/css; charset=utf-8"}[ext]||"application/octet-stream";
    res.writeHead(200,{"Content-Type":ct});res.end(data);
  }catch(e){send(res,500,{error:String(e.message||e)})}
}
http.createServer((req,res)=>router(req,res)).listen(PORT,()=>console.log(`ねーさん生活アルバム: http://localhost:${PORT}`));
