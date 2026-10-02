const API='https://lwzqfmrbwtwfeuuikqsw.supabase.co/functions/v1/public-api';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function get(section){const r=await fetch(API+'?section='+encodeURIComponent(section));const d=await r.json();if(!r.ok)throw Error(d.error||'Ошибка загрузки');return d}
function date(v){return v?new Date(v).toLocaleDateString('ru-RU'):''}
async function show(section,btn){
 document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));if(btn)btn.classList.add('on');
 const box=document.getElementById('list');box.innerHTML='<div class="empty">Загрузка...</div>';
 try{
  const d=await get(section);
  if(!d.length){box.innerHTML='<div class="empty">Пока здесь ничего нет.</div>';return}
  if(section==='feed')box.innerHTML=d.map(x=>'<div class="card"><div class="meta"><span class="badge">'+esc(x.type)+'</span>'+date(x.published_at)+'</div><div class="title">'+esc(x.title)+'</div><div>'+esc(x.body||'')+'</div>'+(x.source_article_url?'<div class="meta" style="margin-top:10px">Источник: <a target="_blank" rel="noopener" href="'+esc(x.source_article_url)+'">'+esc(x.source_name||'первоисточник')+'</a></div>':'')+'</div>').join('');
  if(section==='community')box.innerHTML=d.map(x=>'<div class="card"><div class="meta">'+date(x.published_at)+' · '+esc(x.category||'общее')+'</div><div class="title">'+esc(x.title)+'</div><div>'+esc(x.body||'')+'</div>'+(x.location_text?'<div class="meta">Место: '+esc(x.location_text)+'</div>':'')+'<div class="meta">👍 '+esc(x.reactions?.like||0)+' · ❤️ '+esc(x.reactions?.heart||0)+' · комментариев: '+esc((x.comments||[]).length)+'</div>'+(x.comments||[]).map(c=>'<div class="card" style="margin:8px 0"><div>'+esc(c.body)+'</div></div>').join('')+'<button onclick="openDiscussion(\''+esc(x.id)+'\')">Комментировать в боте</button></div>').join('');
  if(section==='help')box.innerHTML=d.map(x=>'<div class="card"><div class="meta">'+date(x.created_at)+' · '+esc(x.category)+'</div><div class="title">'+esc(x.title)+'</div><div>'+esc(x.description||'')+'</div>'+(x.location_text?'<div class="meta">Место: '+esc(x.location_text)+'</div>':'')+'</div>').join('');
  if(section==='business')box.innerHTML=d.map(x=>'<div class="card"><div class="title '+(x.verified?'verified':'')+'">'+(x.verified?'✓ ':'')+esc(x.name)+'</div><div class="meta">'+esc(x.category||'')+'</div><div>'+esc(x.description||'')+'</div>'+(x.address?'<div class="meta">'+esc(x.address)+'</div>':'')+(x.phone?'<div><a href="tel:'+esc(x.phone)+'">'+esc(x.phone)+'</a></div>':'')+(x.website?'<div><a target="_blank" rel="noopener" href="'+esc(x.website)+'">Сайт</a></div>':'')+'</div>').join('');
 }catch(e){box.innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
function openDiscussion(id){const url='https://t.me/konakovo_ryadom_bot?start=cpost_'+id;if(window.Telegram?.WebApp?.openTelegramLink)Telegram.WebApp.openTelegramLink(url);else window.open(url,'_blank')}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>show(b.dataset.section,b));
window.addEventListener('load',()=>{const b=document.querySelector('.tabs button');show('feed',b);if(window.Telegram?.WebApp){Telegram.WebApp.ready();Telegram.WebApp.expand();}});
