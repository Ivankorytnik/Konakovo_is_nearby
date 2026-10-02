const K=window.KONAKOVO;
const sb=window.supabase.createClient(K.supabaseUrl,K.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const state={view:"home",session:null,me:null,data:{feed:[],help:[],business:[],community:[]},query:""};

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=d=>{if(!d)return "";try{return new Date(d).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}catch{return ""}};
const labelType=t=>({news:"Новость",event:"Событие",alert:"Важно"}[t]||t||"Материал");
const labelHelp=t=>({animal:"Животные",lost_pet:"Потерялось животное",found_pet:"Найдено животное",lost_item:"Потеряно",found_item:"Найдено",person:"Помощь человеку",transport:"Нужна машина",physical:"Физическая помощь",information:"Нужна информация",other:"Другое"}[t]||t||"Помощь");

function toast(msg){
  $("toast").textContent=msg;$("toast").classList.remove("hidden");
  setTimeout(()=>$("toast").classList.add("hidden"),2600);
}
function modal(html){$("modalBody").innerHTML=html;$("modal").classList.remove("hidden")}
function closeModal(){$("modal").classList.add("hidden");$("modalBody").innerHTML=""}
$("modalClose").onclick=closeModal;
$("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal()});

async function publicGet(section){
  const r=await fetch(K.publicApi+"?section="+encodeURIComponent(section),{cache:"no-store"});
  if(!r.ok)throw Error("Не удалось загрузить данные");
  return await r.json();
}
async function resident(action,body=null){
  const {data}=await sb.auth.getSession();state.session=data.session;
  if(!state.session)throw Error("Войдите в профиль");
  const opt={method:body?"POST":"GET",headers:{authorization:"Bearer "+state.session.access_token,"content-type":"application/json"}};
  let url=K.residentApi+"?action="+encodeURIComponent(action);
  if(body)opt.body=JSON.stringify({action,...body});
  const r=await fetch(url,opt);
  const txt=await r.text();let d;try{d=JSON.parse(txt)}catch{d={error:txt}}
  if(!r.ok)throw Error(d.error||"Ошибка");
  return d;
}

async function loadAll(){
  $("statusLine").textContent="Обновляем городскую ленту…";
  const settled=await Promise.allSettled(["feed","help","business","community"].map(async s=>[s,await publicGet(s)]));
  for(const x of settled)if(x.status==="fulfilled")state.data[x.value[0]]=Array.isArray(x.value[1])?x.value[1]:[];
  render();
  $("statusLine").textContent="Данные синхронизированы с общей платформой";
}
function searchable(v){
  return JSON.stringify(v||{}).toLowerCase().includes(state.query.trim().toLowerCase());
}
function itemsForView(){
  let items=[];
  if(state.view==="home")items=[
    ...state.data.feed.map(x=>({...x,_kind:"content"})),
    ...state.data.help.map(x=>({...x,_kind:"help"})),
    ...state.data.community.map(x=>({...x,_kind:"community"}))
  ].sort((a,b)=>new Date(b.published_at||b.created_at||0)-new Date(a.published_at||a.created_at||0)).slice(0,30);
  if(state.view==="news")items=state.data.feed.filter(x=>x.type!=="event").map(x=>({...x,_kind:"content"}));
  if(state.view==="events")items=state.data.feed.filter(x=>x.type==="event").map(x=>({...x,_kind:"content"}));
  if(state.view==="help")items=state.data.help.map(x=>({...x,_kind:"help"}));
  if(state.view==="community")items=state.data.community.map(x=>({...x,_kind:"community"}));
  if(state.view==="business")items=state.data.business.map(x=>({...x,_kind:"business"}));
  return state.query?items.filter(searchable):items;
}
function render(){
  const titles={home:"Сегодня в Конаково",news:"Новости",events:"Афиша",help:"Помощь",community:"Общение жителей",business:"Места и услуги"};
  $("viewTitle").textContent=titles[state.view]||"Конаково";
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  const important=state.data.feed.filter(x=>x.type==="alert");
  $("important").classList.toggle("hidden",!important.length);
  $("importantItems").innerHTML=important.slice(0,3).map(x=>'<div><b>'+esc(x.title)+'</b> <span class="form-note">'+esc(x.body||"")+'</span></div>').join("");
  const items=itemsForView();
  $("feed").innerHTML=items.length?items.map(cardHtml).join(""):'<div class="empty">Пока здесь нет опубликованных материалов.</div>';
  bindDynamic();
}
function cardHtml(x){
  if(x._kind==="content"){
    return '<article class="card"><div class="card-meta"><span class="pill">'+esc(labelType(x.type))+'</span><span>'+esc(fmt(x.published_at))+'</span></div><h3>'+esc(x.title)+'</h3><p>'+esc(x.body||"")+'</p></article>';
  }
  if(x._kind==="help"){
    return '<article class="card"><div class="card-meta"><span class="pill">Помощь · '+esc(labelHelp(x.category))+'</span><span>'+esc(fmt(x.created_at))+'</span></div><h3>'+esc(x.title||"Нужна помощь")+'</h3><p>'+esc(x.description||"")+'</p>'+(x.location_text?'<div class="card-meta" style="margin-top:12px">📍 '+esc(x.location_text)+'</div>':"")+'</article>';
  }
  if(x._kind==="business"){
    const site=x.website&&/^https?:\/\//i.test(x.website)?'<a href="'+esc(x.website)+'" target="_blank" rel="noopener">Сайт</a>':"";
    return '<article class="card"><div class="card-meta"><span class="pill">'+esc(x.category||"Место")+'</span>'+(x.verified?'<span>✓ Проверено</span>':"")+'</div><h3>'+esc(x.name)+'</h3><p>'+esc(x.description||"")+'</p><div class="card-meta" style="margin-top:12px">'+(x.address?'📍 '+esc(x.address):"")+(x.phone?' · ☎ '+esc(x.phone):"")+'</div><div class="card-actions">'+site+'</div></article>';
  }
  const comments=(x.comments||[]).map(c=>'<div class="comment">'+esc(c.body)+'</div>').join("");
  const likes=x.reactions?.like||0, hearts=x.reactions?.heart||0;
  return '<article class="card"><div class="card-meta"><span class="pill">'+esc(x.category||"Обсуждение")+'</span><span>'+esc(fmt(x.published_at))+'</span></div><h3>'+esc(x.title)+'</h3><p>'+esc(x.body||"")+'</p>'+(x.location_text?'<div class="card-meta" style="margin-top:12px">📍 '+esc(x.location_text)+'</div>':"")+'<div class="card-actions"><button data-react="like" data-id="'+esc(x.id)+'">👍 '+likes+'</button><button data-react="heart" data-id="'+esc(x.id)+'">❤ '+hearts+'</button></div><div class="comments">'+comments+(state.session?'<div class="comment-form"><input id="comment-'+esc(x.id)+'" placeholder="Ваш комментарий"><button data-comment="'+esc(x.id)+'">Отправить</button></div>':'<div class="form-note">Войдите, чтобы комментировать.</div>')+'</div></article>';
}
function bindDynamic(){
  document.querySelectorAll("[data-react]").forEach(b=>b.onclick=async()=>{try{await resident("reaction",{post_id:b.dataset.id,reaction:b.dataset.react});await loadSection("community")}catch(e){authOrToast(e)}});
  document.querySelectorAll("[data-comment]").forEach(b=>b.onclick=async()=>{const input=$("comment-"+b.dataset.comment);if(!input?.value.trim())return;try{await resident("comment",{post_id:b.dataset.comment,body:input.value.trim()});toast("Комментарий опубликован");await loadSection("community")}catch(e){authOrToast(e)}});
}
async function loadSection(section){state.data[section]=await publicGet(section);render()}
function setView(v){state.view=v;render();window.scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>setView(b.dataset.view));
$("refreshBtn").onclick=loadAll;
$("globalSearch").oninput=e=>{state.query=e.target.value;render()};

function authOrToast(e){
  if(String(e.message).includes("Войдите")||String(e.message).includes("unauthorized"))showAuth();
  else toast("Не удалось выполнить действие");
}
function showAuth(mode="login"){
  modal('<h2>Профиль жителя</h2><div class="auth-tabs"><button id="tabLogin" class="'+(mode==="login"?"active":"")+'">Вход</button><button id="tabRegister" class="'+(mode==="register"?"active":"")+'">Регистрация</button></div><div id="authForm"></div>');
  $("tabLogin").onclick=()=>renderAuth("login");$("tabRegister").onclick=()=>renderAuth("register");renderAuth(mode);
}
function renderAuth(mode){
  $("tabLogin").classList.toggle("active",mode==="login");$("tabRegister").classList.toggle("active",mode==="register");
  $("authForm").innerHTML='<div class="form-grid">'+(mode==="register"?'<input id="authName" placeholder="Имя">':"")+'<input id="authEmail" type="email" autocomplete="email" placeholder="E-mail"><input id="authPassword" type="password" autocomplete="'+(mode==="login"?"current-password":"new-password")+'" placeholder="Пароль, минимум 8 символов"><div class="form-note">'+(mode==="login"?"Войдите, чтобы публиковать, комментировать и получать уведомления.":"После регистрации профиль будет частью единой Identity-системы Конаково Рядом.")+'</div><div class="form-actions"><button id="authSubmit" class="btn">'+(mode==="login"?"Войти":"Создать профиль")+'</button></div><div id="authMsg" class="form-note"></div></div>';
  $("authSubmit").onclick=()=>mode==="login"?doLogin():doRegister();
}
async function doLogin(){
  const email=$("authEmail").value.trim(),password=$("authPassword").value;
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){$("authMsg").textContent="Не удалось войти. Проверьте e-mail и пароль.";return}
  state.session=data.session;await refreshMe();closeModal();toast("Вы вошли");
}
async function doRegister(){
  const email=$("authEmail").value.trim(),password=$("authPassword").value,name=$("authName").value.trim();
  if(!name||!email||password.length<8){$("authMsg").textContent="Укажите имя, e-mail и пароль не короче 8 символов.";return}
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name}}});
  if(error){$("authMsg").textContent=error.message;return}
  state.session=data.session;
  if(state.session){await refreshMe();closeModal();toast("Профиль создан");}
  else $("authMsg").textContent="Проверьте почту и подтвердите регистрацию, затем войдите.";
}
async function refreshMe(){
  const {data}=await sb.auth.getSession();state.session=data.session;
  if(!state.session){state.me=null;renderUser();return}
  try{state.me=await resident("me")}catch{state.me=null}
  renderUser();
}
function renderUser(){
  const logged=!!state.session;
  $("authBtn").classList.toggle("hidden",logged);
  $("profileBtn").classList.toggle("hidden",!logged);
  $("notifBtn").classList.toggle("hidden",!logged);
  if(logged){
    const name=state.me?.profile?.display_name||state.session.user?.email||"Профиль";
    $("profileBtn").textContent=name.length>18?name.slice(0,17)+"…":name;
    const n=state.me?.unread_notifications||0;$("notifCount").textContent=n;$("notifCount").classList.toggle("hidden",!n);
  }
  render();
}
$("authBtn").onclick=()=>showAuth();
$("profileBtn").onclick=()=>showProfile();
$("notifBtn").onclick=()=>showNotifications();

async function showProfile(){
  await refreshMe();
  const p=state.me?.profile;
  if(!p)return showAuth();
  const identities=(state.me.identities||[]).map(i=>'<div>'+esc(i.channel.toUpperCase())+(i.username?" · "+esc(i.username):"")+'</div>').join("");
  modal('<h2>'+esc(p.display_name||"Профиль")+'</h2><div class="profile-list"><div class="card"><b>Единый профиль</b><p class="form-note">'+identities+'</p></div><button id="profileNotif">Уведомления</button><button id="logoutBtn">Выйти</button></div>');
  $("profileNotif").onclick=showNotifications;
  $("logoutBtn").onclick=async()=>{await sb.auth.signOut();state.session=null;state.me=null;closeModal();renderUser();toast("Вы вышли")};
}
async function showNotifications(){
  try{
    const list=await resident("notifications");
    const html=list.length?list.map(n=>'<div class="card"><div class="card-meta">'+esc(fmt(n.created_at))+'</div><h3>'+esc(n.title)+'</h3><p>'+esc(n.body||"")+'</p></div>').join(""):'<div class="empty">Новых уведомлений нет.</div>';
    modal('<h2>Уведомления</h2><div class="feed">'+html+'</div>');
    await resident("mark_notifications_read",{});if(state.me)state.me.unread_notifications=0;renderUser();
  }catch(e){authOrToast(e)}
}

function createChooser(){
  modal('<h2>Создать</h2><div class="profile-list"><button data-create-choice="help">🤝 Попросить помощь</button><button data-create-choice="post">💬 Создать обсуждение</button><button data-create-choice="content">📰 Предложить новость или событие</button><button data-create-choice="business">🏪 Добавить организацию</button></div>');
  document.querySelectorAll("[data-create-choice]").forEach(b=>b.onclick=()=>openCreate(b.dataset.createChoice));
}
$("mobileCreate").onclick=createChooser;
document.querySelectorAll("[data-create]").forEach(b=>b.onclick=()=>openCreate(b.dataset.create));

function openCreate(type){
  if(!state.session){showAuth();return}
  if(type==="help"){
    modal('<h2>Попросить помощь</h2><div class="form-grid"><select id="fCat"><option value="other">Другое</option><option value="lost_pet">Потерялось животное</option><option value="found_pet">Найдено животное</option><option value="lost_item">Потеряна вещь</option><option value="found_item">Найдена вещь</option><option value="person">Помощь человеку</option><option value="transport">Нужна машина</option><option value="physical">Физическая помощь</option><option value="information">Нужна информация</option></select><input id="fTitle" placeholder="Короткий заголовок"><textarea id="fBody" placeholder="Опишите ситуацию"></textarea><input id="fLocation" placeholder="Улица, район или ориентир"><div class="form-note">Обращение попадёт в общую модерацию и после одобрения станет доступно сайту и подключённым каналам.</div><div class="form-actions"><button id="fSend" class="btn">Отправить на модерацию</button></div></div>');
    $("fSend").onclick=async()=>submitCreate("create_help",{category:$("fCat").value,title:$("fTitle").value,description:$("fBody").value,location_text:$("fLocation").value},"Обращение отправлено");
  }
  if(type==="post"){
    modal('<h2>Обсуждение жителей</h2><div class="form-grid"><input id="pCat" placeholder="Категория: транспорт, ЖКХ, животные…"><input id="pTitle" placeholder="Заголовок"><textarea id="pBody" placeholder="Текст сообщения"></textarea><input id="pLocation" placeholder="Место или район, необязательно"><div class="form-note">Публикация появится после модерации.</div><div class="form-actions"><button id="pSend" class="btn">Отправить</button></div></div>');
    $("pSend").onclick=async()=>submitCreate("create_post",{category:$("pCat").value||"general",title:$("pTitle").value,body:$("pBody").value,location_text:$("pLocation").value},"Обсуждение отправлено на модерацию");
  }
  if(type==="content"){
    modal('<h2>Предложить материал</h2><div class="form-grid"><select id="cType"><option value="news">Новость</option><option value="event">Событие</option></select><input id="cTitle" placeholder="Заголовок"><textarea id="cBody" placeholder="Что произошло? Добавьте факты и детали"></textarea><div class="form-note">Материал будет создан как черновик в общей системе и попадёт редактору.</div><div class="form-actions"><button id="cSend" class="btn">Предложить</button></div></div>');
    $("cSend").onclick=async()=>submitCreate("suggest_content",{type:$("cType").value,title:$("cTitle").value,body:$("cBody").value},"Материал отправлен редактору");
  }
  if(type==="business"){
    modal('<h2>Добавить организацию</h2><div class="form-grid"><input id="bName" placeholder="Название"><input id="bCat" placeholder="Категория"><input id="bAddress" placeholder="Адрес"><input id="bPhone" placeholder="Телефон"><input id="bWebsite" placeholder="Сайт или ссылка, необязательно"><textarea id="bDesc" placeholder="Описание и основные услуги"></textarea><div class="form-note">Карточка появится после проверки модератором.</div><div class="form-actions"><button id="bSend" class="btn">Отправить</button></div></div>');
    $("bSend").onclick=async()=>submitCreate("create_business",{name:$("bName").value,category:$("bCat").value,address:$("bAddress").value,phone:$("bPhone").value,website:$("bWebsite").value,description:$("bDesc").value},"Организация отправлена на проверку");
  }
}
async function submitCreate(action,payload,msg){
  try{await resident(action,payload);closeModal();toast(msg);await loadAll()}catch(e){toast(e.message==="required_field"?"Заполните обязательные поля":"Не удалось отправить")}
}

sb.auth.onAuthStateChange(async(_event,session)=>{state.session=session;if(session)await refreshMe();else{state.me=null;renderUser()}});
window.addEventListener("load",async()=>{
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
  const {data}=await sb.auth.getSession();state.session=data.session;
  if(state.session)await refreshMe();else renderUser();
  await loadAll();
});