import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Конаково Рядом | Control Center</title>
<style>
:root{font-family:Arial,sans-serif;color:#17212b;background:#f4f6f8}
*{box-sizing:border-box}body{margin:0}.top{background:#fff;border-bottom:1px solid #e3e7eb;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0}
.brand{font-size:22px;font-weight:700}.tag{font-size:12px;color:#667085;margin-top:4px}.wrap{max-width:1200px;margin:0 auto;padding:24px}
.login,.card,.panel{background:#fff;border:1px solid #e3e7eb;border-radius:16px;padding:20px}.login{max-width:480px;margin:60px auto}
input,textarea,select,button{font:inherit;border-radius:10px;border:1px solid #cfd6dd;padding:11px 12px}input,textarea,select{width:100%}button{cursor:pointer;background:#17212b;color:#fff;border:0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:18px 0}.n{font-size:34px;font-weight:700;margin-top:8px}.muted{color:#667085}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}
.tabs button{background:#fff;color:#17212b;border:1px solid #d7dde3}.tabs button.active{background:#17212b;color:#fff}.panel{display:none}.panel.active{display:block}
table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #edf0f2;padding:10px;font-size:14px}th{color:#667085}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.status{font-size:13px;padding:7px 10px;background:#eef2f5;border-radius:999px}.hidden{display:none}@media(max-width:800px){.grid,.row{grid-template-columns:1fr}.wrap{padding:14px}.top{padding:14px}}
</style>
</head>
<body>
<header class="top"><div><div class="brand">Конаково Рядом</div><div class="tag">WEB Control Center · v3.5 Platform Ready</div></div><span class="status">PRIVATE BETA</span></header>
<div class="wrap">
<section id="login" class="login">
<h2>Вход администратора</h2>
<p class="muted">Введите адрес Admin API и ключ администратора.</p>
<label>Admin API URL</label><input id="api" placeholder="https://PROJECT.supabase.co/functions/v1/admin-api/dashboard">
<br><br><label>Admin key</label><input id="key" type="password" placeholder="ADMIN_ACCESS_KEY">
<br><br><button onclick="connect()">Войти</button><p id="loginError" class="muted"></p>
</section>
<section id="app" class="hidden">
<div class="grid">
<div class="card"><div class="muted">Пользователи</div><div id="usersCount" class="n">0</div></div>
<div class="card"><div class="muted">Материалы</div><div id="contentCount" class="n">0</div></div>
<div class="card"><div class="muted">Запросы помощи</div><div id="helpCount" class="n">0</div></div>
</div>
<div class="tabs">
<button class="active" onclick="tab('overview',this)">Обзор</button>
<button onclick="tab('users',this)">Пользователи</button>
<button onclick="tab('content',this)">Контент</button>
<button onclick="tab('help',this)">Помощь</button>
</div>
<div id="overview" class="panel active"><h2>Состояние платформы</h2><p>Telegram и WEB используют одну базу. MAX подключается позже через IdentityLink без переноса данных.</p><p class="muted">Текущий этап: PRIVATE BETA.</p></div>
<div id="users" class="panel"><h2>Пользователи</h2><button onclick="loadUsers()">Обновить</button><div style="overflow:auto"><table><thead><tr><th>Имя</th><th>Роль</th><th>Канал</th><th>Статус</th><th>Создан</th></tr></thead><tbody id="usersBody"></tbody></table></div></div>
<div id="content" class="panel"><h2>Контент</h2><div class="row"><input id="title" placeholder="Заголовок"><select id="ctype"><option value="news">Новость</option><option value="event">Событие</option><option value="alert">Важно</option></select></div><br><textarea id="body" rows="5" placeholder="Текст"></textarea><br><br><button onclick="createContent()">Сохранить черновик</button><br><br><div style="overflow:auto"><table><thead><tr><th>Заголовок</th><th>Тип</th><th>Статус</th><th>Дата</th></tr></thead><tbody id="contentBody"></tbody></table></div></div>
<div id="help" class="panel"><h2>Помощь</h2><button onclick="loadHelp()">Обновить</button><div style="overflow:auto"><table><thead><tr><th>Категория</th><th>Заголовок</th><th>Место</th><th>Статус</th><th>Дата</th></tr></thead><tbody id="helpBody"></tbody></table></div></div>
</section></div>
<script>
let base='',key='';
function endpoint(name){return base.replace(/\/(dashboard|users|content|help)\/?$/,'')+'/'+name}
async function req(name,opt){opt=opt||{};const r=await fetch(endpoint(name),Object.assign({},opt,{headers:Object.assign({'content-type':'application/json','x-admin-key':key},opt.headers||{})}));if(!r.ok)throw new Error(await r.text());return r.json()}
async function connect(){base=document.getElementById('api').value.trim();key=document.getElementById('key').value.trim();try{const d=await req('dashboard');sessionStorage.setItem('cc_api',base);sessionStorage.setItem('cc_key',key);document.getElementById('login').classList.add('hidden');document.getElementById('app').classList.remove('hidden');document.getElementById('usersCount').textContent=d.users;document.getElementById('contentCount').textContent=d.content;document.getElementById('helpCount').textContent=d.helpRequests;loadUsers();loadContent();loadHelp()}catch(e){document.getElementById('loginError').textContent='Не удалось войти. Проверьте URL и ключ.'}}
function tab(id,b){document.querySelectorAll('.panel').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.tabs button').forEach(function(x){x.classList.remove('active')});document.getElementById(id).classList.add('active');b.classList.add('active')}
async function loadUsers(){const d=await req('users');document.getElementById('usersBody').innerHTML=d.map(function(x){return '<tr><td>'+(x.display_name||'')+'</td><td>'+x.role+'</td><td>'+((x.identity_links||[]).map(function(i){return i.channel}).join(', '))+'</td><td>'+x.status+'</td><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td></tr>'}).join('')}
async function loadContent(){const d=await req('content');document.getElementById('contentBody').innerHTML=d.map(function(x){return '<tr><td>'+x.title+'</td><td>'+x.type+'</td><td>'+x.status+'</td><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td></tr>'}).join('')}
async function loadHelp(){const d=await req('help');document.getElementById('helpBody').innerHTML=d.map(function(x){return '<tr><td>'+x.category+'</td><td>'+x.title+'</td><td>'+(x.location_text||'')+'</td><td>'+x.status+'</td><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td></tr>'}).join('')}
async function createContent(){const t=document.getElementById('title').value.trim();if(!t)return;await req('content',{method:'POST',body:JSON.stringify({title:t,type:document.getElementById('ctype').value,body:document.getElementById('body').value,status:'draft'})});document.getElementById('title').value='';document.getElementById('body').value='';await loadContent()}
window.addEventListener('load',function(){const a=sessionStorage.getItem('cc_api'),k=sessionStorage.getItem('cc_key');if(a&&k){document.getElementById('api').value=a;document.getElementById('key').value=k;connect()}})
</script>
</body></html>`;

Deno.serve(() => new Response(html, {headers:{
  "content-type":"text/html; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff",
  "x-frame-options":"DENY"
}}));
