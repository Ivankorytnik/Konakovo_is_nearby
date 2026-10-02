const K=window.KONAKOVO;
const sb=window.supabase.createClient(K.supabaseUrl,K.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let currentSession=null,currentStaff=null,businessCache={},contentCache={},currentContentId=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const HELP={new:'Новая',review:'На модерации',approved:'Одобрено',rejected:'Отклонено',closed:'Закрыто'};
const POST={pending:'На модерации',published:'Опубликовано',rejected:'Отклонено',archived:'Архив'};
const REPORT={new:'Новая',review:'На рассмотрении',resolved:'Решена',dismissed:'Отклонена'};
const USER_ROLE={guest:'Гость',registered:'Зарегистрирован',verified:'Подтверждён',business:'Бизнес',admin:'Администратор'};
const STATUS={active:'Активен',blocked:'Заблокирован'};
const STAFF_ROLE={administrator:'Администратор',senior_moderator:'Старший модератор',moderator:'Модератор'};
const BIZ={pending:'На проверке',approved:'Одобрено',rejected:'Отклонено'};
const CONTENT_STATUS={draft:'Черновик',published:'Опубликовано',archived:'Архив'};
const CONTENT_TYPE={news:'Новость',event:'Событие',alert:'Важно'};

async function token(){
  if(currentSession?.access_token)return currentSession.access_token;
  const {data}=await sb.auth.getSession();currentSession=data.session;return currentSession?.access_token||'';
}
async function api(path,opt={}){
  const t=await token();
  const r=await fetch(K.api+'/'+path,{...opt,headers:{'content-type':'application/json',...(t?{authorization:'Bearer '+t}:{}),...(opt.headers||{})}});
  const txt=await r.text();let d;try{d=JSON.parse(txt)}catch{d={error:txt}}
  if(r.status===401){await forceLogout();throw Error('Сессия завершена. Войдите снова.')}
  if(!r.ok)throw Error(d.error||txt);return d;
}
async function edge(url,opt={}){
  const t=await token();
  const r=await fetch(url,{...opt,headers:{'content-type':'application/json',authorization:'Bearer '+t,...(opt.headers||{})}});
  const txt=await r.text();let d;try{d=JSON.parse(txt)}catch{d={error:txt}}
  if(r.status===401){await forceLogout();throw Error('Сессия завершена. Войдите снова.')}
  if(!r.ok)throw Error(d.error||txt);return d;
}
function showLogin(){
  login.classList.remove('hide');app.classList.add('hide');logoutBtn.classList.add('hide');staffBadge.classList.add('hide');
}
async function showApp(){
  currentStaff=await api('me');
  login.classList.add('hide');passwordRecovery.classList.add('hide');app.classList.remove('hide');logoutBtn.classList.remove('hide');staffBadge.classList.remove('hide');
  staffBadge.textContent=(currentStaff.display_name||currentStaff.email)+' · '+(STAFF_ROLE[currentStaff.role]||currentStaff.role);
  const isAdmin=currentStaff.role==='administrator';
  telegramTab.classList.toggle('hide',!isAdmin);teamTab.classList.toggle('hide',!isAdmin);
  const d=await api('dashboard');
  nUsers.textContent=d.users;nContent.textContent=d.content;nHelp.textContent=d.helpRequests;ov.textContent='Backend доступен.';
  const jobs=[loadContent(),loadHelp(),loadCommunity(),loadBusiness(),loadUsers(),loadAudit(),loadStats()];
  if(isAdmin)jobs.push(loadTg(),loadTeam());
  await Promise.all(jobs);
}
async function loginNow(){
  loginErr.textContent='';loginMsg.textContent='';
  const email=emailBox.value.trim(),password=passwordBox.value;
  if(!email||!password){loginErr.textContent='Введите e-mail и пароль.';return}
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){loginErr.textContent='Неверный e-mail или пароль.';return}
  currentSession=data.session;
  try{await showApp()}catch(e){await sb.auth.signOut();currentSession=null;loginErr.textContent=e.message||'Нет доступа к Control Center.';showLogin()}
}
async function logoutNow(){await sb.auth.signOut();currentSession=null;currentStaff=null;showLogin()}
async function forceLogout(){try{await sb.auth.signOut()}catch{}currentSession=null;currentStaff=null;showLogin()}

async function forgotPassword(){
  loginErr.textContent='';loginMsg.textContent='';
  const email=emailBox.value.trim();
  if(!email){loginErr.textContent='Введите e-mail.';return}
  const redirectTo=location.origin+location.pathname;
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)loginErr.textContent=error.message;else loginMsg.textContent='Если этот e-mail зарегистрирован, на него отправлена ссылка для смены пароля.';
}
async function saveNewPassword(){
  const p=newPasswordBox.value;
  if(p.length<10){recoveryMsg.className='bad';recoveryMsg.textContent='Пароль должен быть не короче 10 символов.';return}
  const {error}=await sb.auth.updateUser({password:p});
  if(error){recoveryMsg.className='bad';recoveryMsg.textContent=error.message;return}
  recoveryMsg.className='ok';recoveryMsg.textContent='Пароль изменён.';
  setTimeout(()=>location.replace(location.origin+location.pathname),900);
}
async function checkBootstrap(){
  try{
    const r=await fetch(K.api+'/bootstrap-status');
    const d=await r.json();
    bootstrap.classList.toggle('hide',!d.needsBootstrap);
    normalLogin.classList.toggle('hide',!!d.needsBootstrap);
  }catch{}
}
async function bootstrapAdmin(){
  loginErr.textContent='';loginMsg.textContent='';
  const body={display_name:setupName.value.trim(),email:setupEmail.value.trim(),password:setupPassword.value};
  if(!body.email||body.password.length<10||!setupKey.value.trim()){loginErr.textContent='Заполните e-mail, пароль и текущий Admin key.';return}
  const r=await fetch(K.api+'/bootstrap-admin',{method:'POST',headers:{'content-type':'application/json','x-admin-key':setupKey.value.trim()},body:JSON.stringify(body)});
  const d=await r.json();
  if(!r.ok){loginErr.textContent=d.error==='invalid_setup_key'?'Неверный Admin key.':(d.error||'Ошибка создания администратора.');return}
  loginMsg.textContent='Администратор создан. Теперь вход по e-mail и паролю.';
  emailBox.value=body.email;passwordBox.value=body.password;
  bootstrap.classList.add('hide');normalLogin.classList.remove('hide');
  setupKey.value='';await loginNow();
}

async function loadTg(){
  try{
    const d=await api('telegram-status');
    tgStatus.innerHTML=d.configured&&d.bot?'<span class="ok"><b>@'+esc(d.bot.username)+'</b> подключен</span> · webhook '+(d.webhook?.url?'активен':'не задан'):'Бот не подключен';
  }catch(e){tgStatus.innerHTML='<span class="bad">'+esc(e.message)+'</span>'}
}
async function connectTg(){
  if(!tgToken.value.trim())return;
  try{
    const d=await api('telegram-connect',{method:'POST',body:JSON.stringify({token:tgToken.value.trim()})});
    tgToken.value='';tgResult.className='ok';tgResult.textContent='Готово: @'+d.bot.username;loadTg();
  }catch(e){tgResult.className='bad';tgResult.textContent=e.message}
}

async function loadContent(){
  const d=await edge(K.contentApi);contentCache={};d.forEach(x=>contentCache[x.id]=x);nContent.textContent=d.length;
  contentRows.innerHTML=d.map(x=>'<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td><b>'+esc(x.title)+'</b><br><span class="muted">'+esc(x.body||'').slice(0,180)+'</span></td><td>'+esc(CONTENT_TYPE[x.type]||x.type)+'</td><td><span class="badge">'+esc(CONTENT_STATUS[x.status]||x.status)+'</span><br><br><button class="small" onclick="editContent(\''+x.id+'\')">Изменить</button></td></tr>').join('');
}
function editContent(id){const x=contentCache[id];if(!x)return;currentContentId=id;ctitle.value=x.title||'';ctype.value=x.type||'news';cbody.value=x.body||'';cmsg.className='muted';cmsg.textContent='Редактируется существующий материал'}
async function saveContent(status){
  if(!ctitle.value.trim())return;
  try{
    await edge(K.contentApi,{method:'POST',body:JSON.stringify({id:currentContentId,title:ctitle.value.trim(),type:ctype.value,body:cbody.value,status})});
    currentContentId=null;ctitle.value='';cbody.value='';cmsg.className='ok';cmsg.textContent=status==='published'?'Опубликовано':'Черновик сохранён';
    await Promise.all([loadContent(),loadAudit(),loadStats()]);
  }catch(e){cmsg.className='bad';cmsg.textContent=e.message}
}
async function loadStats(){
  try{
    const d=await edge(K.statsApi);
    ov.textContent='Активных пользователей: '+d.activeUsers+' · Приглашений: '+d.referrals+' · Опубликовано: '+d.publishedContent+' · Новых обращений: '+d.newHelp+' · Активных организаций: '+d.activeBusinesses+' · Обсуждений: '+d.publishedCommunity+' · На модерации: '+d.pendingCommunity+' · Жалоб: '+d.newCommunityReports;
  }catch{ov.textContent='Backend доступен.'}
}
async function loadHelp(){
  const d=await edge(K.helpApi);nHelp.textContent=d.length;
  helpRows.innerHTML=d.map(x=>{
    const opts=Object.entries(HELP).map(([s,l])=>'<option value="'+s+'"'+(x.status===s?' selected':'')+'>'+l+'</option>').join('');
    return '<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td>'+esc(x.category)+'</td><td>'+esc(x.description||'')+'</td><td>'+esc(x.location_text||'')+'</td><td><select id="hs-'+x.id+'">'+opts+'</select><br><br><input id="hn-'+x.id+'" value="'+esc(x.moderation_note||'')+'" placeholder="Комментарий"><br><br><button class="small" onclick="moderateHelp(\''+x.id+'\')">Сохранить</button></td></tr>';
  }).join('');
}
async function moderateHelp(id){
  try{await edge(K.helpApi,{method:'POST',body:JSON.stringify({id,status:document.getElementById('hs-'+id).value,note:document.getElementById('hn-'+id).value})});await Promise.all([loadHelp(),loadAudit()])}catch(e){alert(e.message)}
}
async function loadCommunity(){
  const d=await edge(K.communityApi),posts=d.posts||[],reports=d.reports||[];
  communityRows.innerHTML=posts.map(x=>{
    const statuses=Object.entries(POST).map(([s,l])=>'<option value="'+s+'"'+(x.status===s?' selected':'')+'>'+l+'</option>').join('');
    return '<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td>'+esc(x.profiles?.display_name||'')+'</td><td>'+esc(x.category||'')+'</td><td><b>'+esc(x.title)+'</b><br><span class="muted">'+esc(x.body||'').slice(0,220)+'</span><br><span class="muted">'+esc(x.location_text||'')+'</span></td><td><select id="cp-'+x.id+'">'+statuses+'</select><br><br><input id="cn-'+x.id+'" value="'+esc(x.moderation_note||'')+'" placeholder="Комментарий"><br><br><button class="small" onclick="moderateCommunity(\''+x.id+'\')">Сохранить</button></td></tr>';
  }).join('');
  reportRows.innerHTML=reports.map(x=>{
    const statuses=Object.entries(REPORT).map(([s,l])=>'<option value="'+s+'"'+(x.status===s?' selected':'')+'>'+l+'</option>').join('');
    return '<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td>'+esc((x.entity_type||'')+' '+(x.entity_id||''))+'</td><td>'+esc(x.reason||'')+'</td><td>'+esc(x.details||'')+'</td><td><select id="rp-'+x.id+'">'+statuses+'</select><br><br><button class="small" onclick="resolveReport(\''+x.id+'\')">Сохранить</button></td></tr>';
  }).join('');
}
async function moderateCommunity(id){try{await edge(K.communityApi,{method:'POST',body:JSON.stringify({action:'moderate_post',id,status:document.getElementById('cp-'+id).value,note:document.getElementById('cn-'+id).value})});await Promise.all([loadCommunity(),loadAudit()])}catch(e){alert(e.message)}}
async function resolveReport(id){try{await edge(K.communityApi,{method:'POST',body:JSON.stringify({action:'resolve_report',id,status:document.getElementById('rp-'+id).value})});await Promise.all([loadCommunity(),loadAudit()])}catch(e){alert(e.message)}}

async function loadBusiness(){
  const d=await edge(K.businessApi);nBiz.textContent=d.filter(x=>x.status!=='archived').length;businessCache={};d.forEach(x=>businessCache[x.id]=x);
  bizRows.innerHTML=d.map(x=>'<tr><td><b>'+esc(x.name)+'</b><br><span class="muted">'+esc(x.address||'')+'</span></td><td>'+esc(x.category||'')+'</td><td>'+esc(x.phone||'')+'<br>'+esc(x.website||'')+'</td><td><span class="badge">'+esc(BIZ[x.moderation_status]||x.moderation_status||'На проверке')+'</span> '+(x.verified?'✓':'')+'<br><span class="muted">'+esc(x.moderation_note||'')+'</span></td><td><button class="small" onclick="editBusiness(\''+x.id+'\')">Изменить</button></td></tr>').join('');
}
function editBusiness(id){const x=businessCache[id];bid.value=x.id;bname.value=x.name||'';bcat.value=x.category||'';baddr.value=x.address||'';bphone.value=x.phone||'';bsite.value=x.website||'';bdesc.value=x.description||'';bstatus.value=x.moderation_status||'pending';bnote.value=x.moderation_note||''}
function clearBusiness(){bid.value='';bname.value='';bcat.value='';baddr.value='';bphone.value='';bsite.value='';bdesc.value='';bstatus.value='pending';bnote.value=''}
async function saveBusiness(){
  if(!bname.value.trim())return;
  try{await edge(K.businessApi,{method:'POST',body:JSON.stringify({id:bid.value||null,name:bname.value,category:bcat.value,description:bdesc.value,address:baddr.value,phone:bphone.value,website:bsite.value,moderation_status:bstatus.value,moderation_note:bnote.value})});bmsg.className='ok';bmsg.textContent='Сохранено';clearBusiness();await Promise.all([loadBusiness(),loadAudit()])}catch(e){bmsg.className='bad';bmsg.textContent=e.message}
}

async function loadUsers(){
  const d=await api('users');nUsers.textContent=d.length;
  userRows.innerHTML=d.map(x=>{
    const roleOptions=Object.entries(USER_ROLE).map(([r,l])=>'<option value="'+r+'"'+(x.role===r?' selected':'')+'>'+l+'</option>').join('');
    const statusOptions=Object.entries(STATUS).map(([s,l])=>'<option value="'+s+'"'+(x.status===s?' selected':'')+'>'+l+'</option>').join('');
    return '<tr><td>'+esc(x.display_name||'')+'</td><td><select id="ur-'+x.id+'">'+roleOptions+'</select></td><td>'+esc((x.identity_links||[]).map(i=>i.username?'@'+i.username:i.channel).join(', '))+'</td><td><select id="us-'+x.id+'">'+statusOptions+'</select><br><label><input type="checkbox" id="ub-'+x.id+'" style="width:auto"'+(x.beta_allowed?' checked':'')+'> PRIVATE BETA</label><br><br><button class="small" onclick="saveUser(\''+x.id+'\')">Сохранить</button></td><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td></tr>';
  }).join('');
}
async function saveUser(id){try{await edge(K.userApi,{method:'POST',body:JSON.stringify({id,role:document.getElementById('ur-'+id).value,status:document.getElementById('us-'+id).value,beta_allowed:document.getElementById('ub-'+id).checked})});await Promise.all([loadUsers(),loadAudit(),loadStats()])}catch(e){alert(e.message)}}
async function loadAudit(){
  const d=await edge(K.auditApi);auditRows.innerHTML=d.map(x=>'<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td>'+esc(x.actor)+'</td><td>'+esc(x.action)+'</td><td>'+esc((x.entity_type||'')+' '+(x.entity_id||''))+'</td><td>'+esc(JSON.stringify(x.metadata||{})).slice(0,220)+'</td></tr>').join('');
}

async function loadTeam(){
  if(currentStaff?.role!=='administrator')return;
  const d=await api('team');
  teamRows.innerHTML=d.map(x=>{
    const roles=Object.entries(STAFF_ROLE).map(([r,l])=>'<option value="'+r+'"'+(x.role===r?' selected':'')+'>'+l+'</option>').join('');
    const statuses=Object.entries(STATUS).map(([s,l])=>'<option value="'+s+'"'+(x.status===s?' selected':'')+'>'+l+'</option>').join('');
    return '<tr><td>'+esc(x.display_name||'')+'</td><td>'+esc(x.email)+'</td><td><select id="tr-'+x.id+'">'+roles+'</select></td><td><select id="ts-'+x.id+'">'+statuses+'</select></td><td>'+esc(x.last_login_at?new Date(x.last_login_at).toLocaleString('ru-RU'):'Ещё не входил')+'</td><td><button class="small" onclick="saveStaff(\''+x.id+'\')">Сохранить</button></td></tr>';
  }).join('');
}
async function createStaff(){
  teamMsg.textContent='';
  const body={action:'create',display_name:teamName.value.trim(),email:teamEmail.value.trim(),password:teamPassword.value,role:teamRole.value};
  if(!body.email||body.password.length<10){teamMsg.className='bad';teamMsg.textContent='Укажите e-mail и временный пароль не короче 10 символов.';return}
  try{await api('team',{method:'POST',body:JSON.stringify(body)});teamName.value='';teamEmail.value='';teamPassword.value='';teamMsg.className='ok';teamMsg.textContent='Сотрудник добавлен.';await Promise.all([loadTeam(),loadAudit()])}catch(e){teamMsg.className='bad';teamMsg.textContent=e.message}
}
async function saveStaff(id){
  try{await api('team',{method:'POST',body:JSON.stringify({action:'update',id,role:document.getElementById('tr-'+id).value,status:document.getElementById('ts-'+id).value})});await Promise.all([loadTeam(),loadAudit()])}catch(e){alert(e.message)}
}

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.p').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');document.getElementById(b.dataset.p).classList.add('on');
});

sb.auth.onAuthStateChange(async(event,session)=>{
  currentSession=session;
  if(event==='PASSWORD_RECOVERY'){login.classList.add('hide');app.classList.add('hide');passwordRecovery.classList.remove('hide')}
});

window.onload=async()=>{
  await checkBootstrap();
  const {data}=await sb.auth.getSession();currentSession=data.session;
  if(currentSession){try{await showApp()}catch{await forceLogout()}}else showLogin();
};