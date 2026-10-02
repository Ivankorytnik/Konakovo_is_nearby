let key='',businessCache={};
const K=window.KONAKOVO;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path,opt={}){
  const r=await fetch(K.api+'/'+path,{...opt,headers:{'content-type':'application/json','x-admin-key':key,...(opt.headers||{})}});
  const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={error:t}}
  if(!r.ok)throw Error(d.error||t);return d;
}

async function rpc(name,args={}){
  const r=await fetch(K.rest+name,{method:'POST',headers:{'content-type':'application/json','apikey':K.publishable,'Authorization':'Bearer '+K.publishable},body:JSON.stringify({p_key:key,...args})});
  const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={error:t}}
  if(!r.ok)throw Error(d.message||d.error||t);return d;
}

async function loginNow(){
  key=keyBox.value.trim();
  try{
    const d=await api('dashboard');
    sessionStorage.setItem('cc_key',key);
    login.classList.add('hide');app.classList.remove('hide');
    nUsers.textContent=d.users;nContent.textContent=d.content;nHelp.textContent=d.helpRequests;ov.textContent='Backend доступен.';
    await Promise.all([loadTg(),loadContent(),loadHelp(),loadBusiness(),loadUsers(),loadAudit()]);
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
  const d=await api('content');
  contentRows.innerHTML=d.map(x=>'<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td><b>'+esc(x.title)+'</b><br><span class="muted">'+esc(x.body||'').slice(0,180)+'</span></td><td>'+esc(x.type)+'</td><td><span class="badge">'+esc(x.status)+'</span></td></tr>').join('');
}

async function saveContent(status){
  if(!ctitle.value.trim())return;
  try{
    await api('content',{method:'POST',body:JSON.stringify({title:ctitle.value.trim(),type:ctype.value,body:cbody.value,status})});
    ctitle.value='';cbody.value='';cmsg.className='ok';cmsg.textContent=status==='published'?'Опубликовано в боте':'Черновик сохранён';loadContent();
  }catch(e){cmsg.className='bad';cmsg.textContent=e.message}
}

async function loadHelp(){
  const d=await rpc('admin_list_help');nHelp.textContent=d.length;
  helpRows.innerHTML=d.map(x=>{
    const opts=['new','review','approved','rejected','closed'].map(s=>'<option value="'+s+'"'+(x.status===s?' selected':'')+'>'+s+'</option>').join('');
    return '<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td>'+esc(x.category)+'</td><td>'+esc(x.description||'')+'</td><td>'+esc(x.location_text||'')+'</td><td><select id="hs-'+x.id+'">'+opts+'</select><br><br><input id="hn-'+x.id+'" value="'+esc(x.moderation_note||'')+'" placeholder="Комментарий"><br><br><button class="small" onclick="moderateHelp(\''+x.id+'\')">Сохранить</button></td></tr>';
  }).join('');
}

async function moderateHelp(id){
  try{
    await rpc('admin_update_help',{p_id:id,p_status:document.getElementById('hs-'+id).value,p_note:document.getElementById('hn-'+id).value});
    await Promise.all([loadHelp(),loadAudit()]);
  }catch(e){alert(e.message)}
}

async function loadBusiness(){
  const d=await rpc('admin_list_businesses');
  nBiz.textContent=d.filter(x=>x.status!=='archived').length;businessCache={};d.forEach(x=>businessCache[x.id]=x);
  bizRows.innerHTML=d.map(x=>'<tr><td><b>'+esc(x.name)+'</b><br><span class="muted">'+esc(x.address||'')+'</span></td><td>'+esc(x.category||'')+'</td><td>'+esc(x.phone||'')+'<br>'+esc(x.website||'')+'</td><td><span class="badge">'+esc(x.status)+'</span> '+(x.verified?'✓':'')+'</td><td><button class="small" onclick="editBusiness(\''+x.id+'\')">Изменить</button></td></tr>').join('');
}

function editBusiness(id){
  const x=businessCache[id];
  bid.value=x.id;bname.value=x.name||'';bcat.value=x.category||'';baddr.value=x.address||'';bphone.value=x.phone||'';bsite.value=x.website||'';bdesc.value=x.description||'';bstatus.value=x.status;bverified.checked=!!x.verified;
}

function clearBusiness(){
  bid.value='';bname.value='';bcat.value='';baddr.value='';bphone.value='';bsite.value='';bdesc.value='';bstatus.value='draft';bverified.checked=false;
}

async function saveBusiness(){
  if(!bname.value.trim())return;
  try{
    await rpc('admin_save_business',{p_id:bid.value||null,p_name:bname.value,p_category:bcat.value,p_description:bdesc.value,p_address:baddr.value,p_phone:bphone.value,p_website:bsite.value,p_status:bstatus.value,p_verified:bverified.checked});
    bmsg.className='ok';bmsg.textContent='Сохранено';clearBusiness();await Promise.all([loadBusiness(),loadAudit()]);
  }catch(e){bmsg.className='bad';bmsg.textContent=e.message}
}

async function loadUsers(){
  const d=await api('users');
  userRows.innerHTML=d.map(x=>'<tr><td>'+esc(x.display_name||'')+'</td><td>'+esc(x.role)+'</td><td>'+esc((x.identity_links||[]).map(i=>i.username?'@'+i.username:i.channel).join(', '))+'</td><td>'+esc(x.status)+'</td><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td></tr>').join('');
}

async function loadAudit(){
  const d=await rpc('admin_list_audit');
  auditRows.innerHTML=d.map(x=>'<tr><td>'+new Date(x.created_at).toLocaleString('ru-RU')+'</td><td>'+esc(x.actor)+'</td><td>'+esc(x.action)+'</td><td>'+esc((x.entity_type||'')+' '+(x.entity_id||''))+'</td><td>'+esc(JSON.stringify(x.metadata||{})).slice(0,220)+'</td></tr>').join('');
}

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.p').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');document.getElementById(b.dataset.p).classList.add('on');
});
window.onload=()=>{const s=sessionStorage.getItem('cc_key');if(s){keyBox.value=s;loginNow()}};
