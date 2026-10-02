import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const API="https://lwzqfmrbwtwfeuuikqsw.supabase.co/functions/v1/admin-api";
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Конаково Рядом</title><style>
body{font-family:Arial,sans-serif;background:#f5f6f8;margin:0;color:#17212b}.w{max-width:900px;margin:auto;padding:24px}.c{background:#fff;border:1px solid #ddd;border-radius:14px;padding:18px;margin:14px 0}input,button{font:inherit;padding:11px;border-radius:9px}input{width:100%;box-sizing:border-box;border:1px solid #ccc}button{border:0;background:#17212b;color:#fff;cursor:pointer}.muted{color:#667085}.good{color:#067647}.bad{color:#b42318}.hide{display:none}</style></head><body><div class="w">
<h1>Конаково Рядом</h1><p class="muted">WEB Control Center · PRIVATE BETA · v3.5 Platform Ready</p>
<div id="login" class="c"><h2>Вход</h2><input id="k" type="password" placeholder="Admin key"><br><br><button onclick="login()">Войти</button><p id="e" class="bad"></p></div>
<div id="app" class="hide">
<div class="c"><h2>Состояние</h2><div id="stats">Загрузка...</div></div>
<div class="c"><h2>Telegram</h2><div id="ts" class="muted">Проверка...</div><br><input id="tok" type="password" placeholder="Токен из @BotFather"><br><br><button onclick="connectBot()">Подключить бот и webhook</button><p id="tr"></p></div>
</div></div><script>
let key="";
async function call(p,o={}){const r=await fetch(API+"/"+p,{...o,headers:{"content-type":"application/json","x-admin-key":key,...(o.headers||{})}});const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={error:t}}if(!r.ok)throw new Error(d.error||t);return d}
async function login(){key=k.value.trim();try{const d=await call("dashboard");login.classList.add("hide");app.classList.remove("hide");stats.textContent="Пользователи: "+d.users+" · Материалы: "+d.content+" · Помощь: "+d.helpRequests;sessionStorage.setItem("cc_key",key);statusBot()}catch(x){e.textContent="Неверный ключ"}}
async function statusBot(){try{const d=await call("telegram-status");if(!d.configured){ts.textContent="Бот не подключен";return}if(d.error){ts.innerHTML='<span class="bad">'+d.error+'</span>';return}ts.innerHTML='<span class="good">Подключен @'+(d.bot.username||"")+'</span> · webhook '+(d.webhook.url?"активен":"не задан")}catch(x){ts.textContent=x.message}}
async function connectBot(){tr.className="muted";tr.textContent="Подключаю...";try{const d=await call("telegram-connect",{method:"POST",body:JSON.stringify({token:tok.value.trim()})});tok.value="";tr.className="good";tr.textContent="Готово: @"+d.bot.username;statusBot()}catch(x){tr.className="bad";tr.textContent=x.message}}
window.onload=()=>{const v=sessionStorage.getItem("cc_key");if(v){k.value=v;login()}}
</script></body></html>`;
Deno.serve(()=>new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"DENY","referrer-policy":"no-referrer"}}));