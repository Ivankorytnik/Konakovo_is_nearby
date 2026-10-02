let key='',businessCache={},contentCache={},currentContentId=null;
const K=window.KONAKOVO;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path,opt={}){
  const r=await fetch(K.api+'/'+path,{...opt,headers:{'content-type':'application/json','x-admin-key':key,...(opt.headers||{})}});
  const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={error:t}}
  if(!r.ok)throw Error(d.error||t);return d;
}

async function edge(url,opt={}){
  const r=await fetch(url,{...opt,headers:{'content-type':'application/json','x-admin-key':key,...(opt.headers||{})}});
  const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={error:t}}
  if(!r.ok)throw Error(d.error||t);return d;
}

async function loginNow(){
  key=keyBox.value.trim();
  try{
    const d=await api('dashboard');
    sessionStorage.setItem('cc_key',key);
    login.classList.add('hide');app.classList.remove('hide');
    nUsers.textContent=d.users;nContent.textContent=d.content;nHelp.textContent=d.helpRequests;ov.textContent='Backend доступен.';
    await Promise.all([loadTg(),loadContent(),loadHelp(),loadBusiness(),loadUsers(),loadAudit(),loadStats()]);
  }catch(e){loginErr.textContent='Неверный ключ администратора.'}
}

async function loadTg(){
  try{
    const d=await api('telegram-status');
    tgStatus.innerHTML=d.configured&&d.bot
      ?'<span class="ok"><b>@'+esc(d.bot.username)+'</b> подключен</span> · webhook '+(d.webhook?.url?'активен':'не задан')
      :'Бот не подключен';
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
  const d=await edge(K.contentApi);
  contentCache={};d.forEach(x=>contentCache[x.id]=x);
  nContent.textContent=d.length;
  contentRows.innerHTML=d.map(x=>'<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td><b>'+esc(x.title)+'</b><br><span class="muted">'+esc(x.body||'').slice(0,180)+'</span></td><td>'+esc(x.type)+'</td><td><span class="badge">'+esc(x.status)+'</span><br><br><button class="small" onclick="editContent(\''+x.id+'\')">Изменить</button></td></tr>').join('');
}

function editContent(id){
  const x=contentCache[id]; if(!x)return;
  currentContentId=id; ctitle.value=x.title||''; ctype.value=x.type||'news'; cbody.value=x.body||'';
  cmsg.className='muted'; cmsg.textContent='Редактируется существующий материал';
}

async function saveContent(status){
  if(!ctitle.value.trim())return;
  try{
    await edge(K.contentApi,{method:'POST',body:JSON.stringify({id:currentContentId,title:ctitle.value.trim(),type:ctype.value,body:cbody.value,status})});
    currentContentId=null;ctitle.value='';cbody.value='';cmsg.className='ok';cmsg.textContent=status==='published'?'Опубликовано в боте':status==='archived'?'Перенесено в архив':'Черновик сохранён';
    await Promise.all([loadContent(),loadAudit(),loadStats()]);
  }catch(e){cmsg.className='bad';cmsg.textContent=e.message}
}

async function loadStats(){
  try{
    const d=await edge(K.statsApi);
    ov.textContent='Активных пользователей: '+d.activeUsers+' · Приглашений: '+d.referrals+' · Опубликовано: '+d.publishedContent+' · Новых обращений: '+d.newHelp+' · Активных организаций: '+d.activeBusinesses;
  }catch(e){ov.textContent='Backend доступен.'}
}

async function loadHelp(){
  const d=await edge(K.helpApi);nHelp.textContent=d.length;
  helpRows.innerHTML=d.map(x=>{
    const opts=['new','review','approved','rejected','closed'].map(s=>'<option value="'+s+'"'+(x.status===s?' selected':'')+'>'+s+'</option>').join('');
    return '<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td>'+esc(x.category)+'</td><td>'+esc(x.description||'')+'</td><td>'+esc(x.location_text||'')+'</td><td><select id="hs-'+x.id+'">'+opts+'</select><br><br><input id="hn-'+x.id+'" value="'+esc(x.moderation_note||'')+'" placeholder="Комментарий"><br><br><button class="small" onclick="moderateHelp(\''+x.id+'\')">Сохранить</button></td></tr>';
  }).join('');
}

async function moderateHelp(id){
  try{
    await edge(K.helpApi,{method:'POST',body:JSON.stringify({id,status:document.getElementById('hs-'+id).value,note:document.getElementById('hn-'+id).value})});
    await Promise.all([loadHelp(),loadAudit()]);
  }catch(e){alert(e.message)}
}

async function loadBusiness(){
  const d=await edge(K.businessApi);
  nBiz.textContent=d.filter(x=>x.status!=='archived').length;businessCache={};d.forEach(x=>businessCache[x.id]=x);
  bizRows.innerHTML=d.map(x=>'<tr><td><b>'+esc(x.name)+'</b><br><span class="muted">'+esc(x.address||'')+'</span></td><td>'+esc(x.category||'')+'</td><td>'+esc(x.phone||'')+'<br>'+esc(x.website||'')+'</td><td><span class="badge">'+esc(x.moderation_status||'pending')+'</span> '+(x.verified?'✓':'')+'<br><span class="muted">'+esc(x.moderation_note||'')+'</span></td><td><button class="small" onclick="editBusiness(\''+x.id+'\')">Изменить</button></td></tr>').join('');
}

function editBusiness(id){
  const x=businessCache[id];
  bid.value=x.id;bname.value=x.name||'';bcat.value=x.category||'';baddr.value=x.address||'';bphone.value=x.phone||'';bsite.value=x.website||'';bdesc.value=x.description||'';bstatus.value=x.moderation_status||'pending';bnote.value=x.moderation_note||'';
}

function clearBusiness(){
  bid.value='';bname.value='';bcat.value='';baddr.value='';bphone.value='';bsite.value='';bdesc.value='';bstatus.value='pending';bnote.value='';
}

async function saveBusiness(){
  if(!bname.value.trim())return;
  try{
    await edge(K.businessApi,{method:'POST',body:JSON.stringify({id:bid.value||null,name:bname.value,category:bcat.value,description:bdesc.value,address:baddr.value,phone:bphone.value,website:bsite.value,moderation_status:bstatus.value,moderation_note:bnote.value})});
    bmsg.className='ok';bmsg.textContent='Сохранено';clearBusiness();await Promise.all([loadBusiness(),loadAudit()]);
  }catch(e){bmsg.className='bad';bmsg.textContent=e.message}
}

async function loadUsers(){
  const d=await api('users');
  nUsers.textContent=d.length;
  userRows.innerHTML=d.map(x=>{
    const roleOptions=['guest','registered','verified','business','admin'].map(r=>'<option value="'+r+'"'+(x.role===r?' selected':'')+'>'+r+'</option>').join('');
    const statusOptions=['active','blocked'].map(s=>'<option value="'+s+'"'+(x.status===s?' selected':'')+'>'+s+'</option>').join('');
    return '<tr><td>'+esc(x.display_name||'')+'</td><td><select id="ur-'+x.id+'">'+roleOptions+'</select></td><td>'+esc((x.identity_links||[]).map(i=>i.username?'@'+i.username:i.channel).join(', '))+'</td><td><select id="us-'+x.id+'">'+statusOptions+'</select><br><label><input type="checkbox" id="ub-'+x.id+'" style="width:auto"'+(x.beta_allowed?' checked':'')+'> PRIVATE BETA</label><br><br><button class="small" onclick="saveUser(\''+x.id+'\')">Сохранить</button></td><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td></tr>';
  }).join('');
}

async function saveUser(id){
  try{
    await edge(K.userApi,{method:'POST',body:JSON.stringify({id,role:document.getElementById('ur-'+id).value,status:document.getElementById('us-'+id).value,beta_allowed:document.getElementById('ub-'+id).checked})});
    await Promise.all([loadUsers(),loadAudit(),loadStats()]);
  }catch(e){alert(e.message)}
}

async function loadAudit(){
  const d=await edge(K.auditApi);
  auditRows.innerHTML=d.map(x=>'<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td>'+esc(x.actor)+'</td><td>'+esc(x.action)+'</td><td>'+esc((x.entity_type||'')+' '+(x.entity_id||''))+'</td><td>'+esc(JSON.stringify(x.metadata||{})).slice(0,220)+'</td></tr>').join('');
}

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.p').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');document.getElementById(b.dataset.p).classList.add('on');
});
window.onload=()=>{const s=sessionStorage.getItem('cc_key');if(s){keyBox.value=s;loginNow()}};
