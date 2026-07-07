const SUPABASE_URL  = 'https://yjslyloaydufvneaauqm.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlqc2x5bG9heWR1ZnZuZWFhdXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTU0NzAsImV4cCI6MjA5NzAzMTQ3MH0.PEBOTMxHuNpwAi-01xOvHXDB-DpkNO7av1V7NELgbMM';
const FABIANA_PHONE = '5531985386404';
const HORARIOS      = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
const ALL_HORARIOS  = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
const SERV_ICONS    = {
  'Remoção':'🧴','Alongamento molde F1':'💅','Manutenção':'🔧',
  'Manutenção de outro local':'🔄','Francesa definitiva':'🤍',
  'Decoração completa':'🎨','Blindagem':'🛡️','Banho de gel':'💎'
};
const DEFAULT_INFO  = {
  especialidade: 'Nail Designer · Especialista em Molde F1 e Nail Art',
  bio: 'Fabiana Fiuza, 28 anos, Nail Designer. Atuo na área há 2 anos. Amo a área da beleza desde pequena. Pronta para fazer você ainda mais linda! 💅',
  seu_momento: 'Reserve este momento para o seu auto cuidado!\n\nNossos procedimentos têm duração média de 02:00h a 03:00h, se programe para vir com tempo, tranquilidade e tenha uma experiência ainda melhor.\n\nSinta-se à vontade para conversar, pedir uma água, ou uma pausa para o banheiro, quero que se sinta em casa, confortável e acolhida.',
  endereco: 'Rua Copeia, 814 — São Geraldo · Belo Horizonte, MG',
  maps_url: 'https://maps.google.com/?q=Rua+Copeia+814+São+Geraldo+Belo+Horizonte+MG',
  instagram: 'ffiuza_nails',
  whatsapp: '5531985386404',
  seg_sex: '09:00 – 18:00',
  sabado: '09:00 – 16:00',
  domingo: 'Fechado',
  obs_servicos: 'A decoração é cobrada à parte do alongamento e da manutenção. A manutenção vinda de outro local deve ser avaliada previamente.'
};
const MESES         = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PAGAMENTOS    = ['Pix','Cartão Crédito','Cartão Débito','Dinheiro'];
const SINAL_VALOR   = 50;
const FABIANA_PIX   = '(31) 98538-6404'; // Chave Pix (telefone)

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let user=null, profile=null, servicos=[], servicosAll=[], salonConfig=null;
let bkServs=[], bkData=null, bkHora=null, bkMonth=new Date(), bkPagamento=null;
let admWeekOff=0, admSelDate=todayStr(), editAgendId=null, editServId=null, admHorData=null, admHorMonth=new Date(), admHorDow=null, admAgServs=[];
const SALON_SEC_DEFS=[
  {key:'bio',      label:'Sobre Mim',            icon:'👩'},
  {key:'momento',  label:'Seu Momento',           icon:'✨'},
  {key:'contato',  label:'Localização & Contato', icon:'📍'},
  {key:'horarios', label:'Horários',              icon:'🕐'},
  {key:'pagamento',label:'Formas de Pagamento',   icon:'💳'},
  {key:'comodidades',label:'Comodidades',         icon:'⭐'},
  {key:'obs',      label:'Observações',           icon:'⚠️'},
];
const DNS_LABELS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
let finPeriodo='hoje';

// ── TEMA ──
function initTheme(){
  const saved=localStorage.getItem('ffiuza_theme');
  if(saved) document.documentElement.setAttribute('data-theme',saved);
  updateThemeIcon();
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const sysDark=window.matchMedia('(prefers-color-scheme:dark)').matches;
  let next;
  if(!cur) next=sysDark?'light':'dark';
  else if(cur==='dark') next='light';
  else next='dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('ffiuza_theme',next);
  updateThemeIcon();
}
function updateThemeIcon(){
  const cur=document.documentElement.getAttribute('data-theme');
  const sysDark=window.matchMedia('(prefers-color-scheme:dark)').matches;
  const isDark=cur==='dark'||(cur!=='light'&&sysDark);
  // Update all theme icons across the page
  document.querySelectorAll('.th-icon').forEach(el=>{el.textContent=isDark?'☀️':'🌙';});
  const icon=document.getElementById('theme-icon');
  if(icon) icon.textContent=isDark?'☀️':'🌙';
}
initTheme();

// ── NOTIFICAÇÕES ──
let notifOpen=false;
let notifRealtime=null;
let cliRealtime=null;

function toggleNotifPanel(){
  notifOpen=!notifOpen;
  document.getElementById('notif-panel')?.classList.toggle('open',notifOpen);
  document.getElementById('notif-backdrop')?.classList.toggle('open',notifOpen);
  if(notifOpen) renderNotifPanel();
}

async function autoCancelExpiredPending(){
  const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
  const{data:expired}=await sb.from('agendamentos')
    .select('id').eq('status','pendente').lt('created_at',cutoff);
  if(!expired?.length) return 0;
  await sb.from('agendamentos').update({status:'cancelado'}).in('id',expired.map(a=>a.id));
  await updateNotifCount();
  return expired.length;
}

async function renderNotifPanel(){
  const cancelados=await autoCancelExpiredPending();
  if(cancelados) toast(`⏰ ${cancelados} agendamento${cancelados>1?'s':''} sem Pix cancelado${cancelados>1?'s':''} automaticamente`);
  const today=todayStr();
  const{data}=await sb.from('agendamentos')
    .select('*,servico:servicos(nome,preco),cliente:profiles(nome,tel)')
    .eq('status','pendente').gte('data',today)
    .order('data').order('hora');
  const el=document.getElementById('notif-body'); if(!el) return;
  if(!data||!data.length){
    el.innerHTML='<div style="text-align:center;padding:32px;color:var(--t3);font-size:.85rem">Sem solicitações pendentes ✅</div>';
    return;
  }
  el.innerHTML=data.map(a=>{
    const d=new Date(a.data+'T00:00:00');
    const dow=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
    const restante=Math.max(0,(a.servico?.preco||a.valor||0)-SINAL_VALOR);
    const pendH=Math.floor((Date.now()-new Date(a.created_at).getTime())/3600000);
    const pendStr=pendH<1?'há menos de 1h':pendH===1?'há 1h':`há ${pendH}h`;
    const quaseExp=pendH>=20;
    return `<div class="notif-item pend">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
        <div style="font-size:.82rem;font-weight:900;color:var(--goldt)">⏳ Pix pendente</div>
        <div style="font-size:.66rem;color:${quaseExp?'var(--redt)':'var(--t3)'};font-weight:${quaseExp?800:600};text-align:right;flex-shrink:0">${pendStr}${quaseExp?' ⚠️':''}</div>
      </div>
      <div style="font-weight:800;font-size:.9rem">${a.cliente?.nome||'—'}</div>
      <div style="font-size:.78rem;color:var(--t2);margin-top:2px">💅 ${a.servico?.nome||'—'}</div>
      <div style="font-size:.76rem;color:var(--t3);margin-top:2px">${dow}, ${fmtDate(a.data)} às ${fmtH(a.hora)} · Restante: <strong>${fmtMoney(restante)}</strong></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-sm" style="flex:1;background:var(--green);color:#fff" onclick="admConfPixNotif('${a.id}')">✓ Recebido</button>
        <button class="btn btn-sm" style="flex:1;background:var(--red);color:#fff" onclick="admRejectPixNotif('${a.id}')">✗ Cancelar</button>
      </div>
    </div>`;
  }).join('');
}

async function admConfPixNotif(id){
  if(!confirm('Confirmar recebimento do Pix?')) return;
  const{error}=await sb.from('agendamentos').update({status:'agendado',sinal_pago:true}).eq('id',id);
  if(error){toast('Erro: '+error.message);return;}
  toast('✅ Pix confirmado! Agendamento aprovado.');
  await updateNotifCount();
  renderNotifPanel();
  admRenderDash();
}

async function admRejectPixNotif(id){
  const{data:a}=await sb.from('agendamentos')
    .select('*,cliente:profiles(nome,tel),servico:servicos(nome)')
    .eq('id',id).single();
  if(!a) return;
  const nome=a.cliente?.nome||'cliente';
  if(!confirm(`Cancelar agendamento de ${nome} por Pix não recebido?`)) return;
  const{error}=await sb.from('agendamentos').update({status:'cancelado'}).eq('id',id);
  if(error){toast('Erro: '+error.message);return;}
  const tel=(a.cliente?.tel||'').replace(/\D/g,'');
  if(tel){
    const msg=`Olá ${nome.split(' ')[0]}! 😊 Infelizmente seu agendamento na *Fiuza Nails* foi *cancelado* pois não identificamos o pagamento do sinal Pix dentro de 24h.\n\nSe quiser remarcar, acesse o app! 💅\n_@ffiuza_nails_`;
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`,'_blank');
  }
  toast('✅ Agendamento cancelado.');
  await updateNotifCount();
  renderNotifPanel();
  admRenderDash();
}

async function updateNotifCount(){
  const today=todayStr();
  const{count}=await sb.from('agendamentos').select('*',{count:'exact',head:true})
    .eq('status','pendente').gte('data',today);
  const n=count||0;
  const navBadge=document.getElementById('nav-pend-badge');
  if(navBadge){ navBadge.textContent=n; navBadge.classList.toggle('hidden',n===0); }
  ['notif-badge','notif-badge-ag'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.textContent=n; el.classList.toggle('hidden',n===0); }
  });
  return n;
}

function initNotifications(){
  updateNotifCount();
  // Realtime: qualquer mudança nos agendamentos (novo/confirmado/cancelado/editado)
  // atualiza o badge, a tela visível e o painel de notificações.
  if(notifRealtime) sb.removeChannel(notifRealtime);
  notifRealtime=sb.channel('adm-agend')
    .on('postgres_changes',{event:'*',schema:'public',table:'agendamentos'},async(payload)=>{
      const n=await updateNotifCount();
      if(payload.eventType==='INSERT' && payload.new?.status==='pendente'){
        toast(`🔔 Nova solicitação de agendamento! (${n} pendente${n>1?'s':''})`);
      }
      admRefreshCurrent();
      if(notifOpen) renderNotifPanel();
    })
    .subscribe();
}

// Atualiza só a aba que o admin está vendo (evita trabalho à toa)
function admRefreshCurrent(){
  const tab=document.querySelector('.nav-tab.active[id^="antab-"]')?.id?.replace('antab-','');
  if(tab==='dashboard') admRenderDash();
  else if(tab==='agenda') admRenderAgenda();
}

// Realtime do lado da cliente: reage às mudanças dos próprios agendamentos
function initClienteRealtime(){
  if(cliRealtime) sb.removeChannel(cliRealtime);
  cliRealtime=sb.channel('cli-agend')
    .on('postgres_changes',{event:'*',schema:'public',table:'agendamentos',filter:`cliente_id=eq.${user.id}`},(payload)=>{
      const oldS=payload.old?.status, newS=payload.new?.status;
      if(payload.eventType==='UPDATE'){
        if(newS==='agendado' && oldS && oldS!=='agendado') toast('✅ Pagamento confirmado! Seu horário está reservado 💅');
        else if(newS==='cancelado' && oldS!=='cancelado') toast('⚠️ Seu agendamento foi cancelado.');
      }
      cliRefreshCurrent();
    })
    .subscribe();
}

// Atualiza só a aba que a cliente está vendo
function cliRefreshCurrent(){
  const visible=CLI_TABS.find(t=>!document.getElementById('cli-'+t)?.classList.contains('hidden'));
  if(visible==='home') cliRenderHome();
  else if(visible==='historico') cliRenderHist();
}

// ── UTILS ──
function todayStr(){ return new Date().toISOString().split('T')[0]; }
function fmtDate(d){ if(!d) return ''; const[y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }
function fmtMoney(v){ return 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2}); }
function fmtH(h){ return h?h.slice(0,5):''; }
function ptDate(ds){ const d=new Date(ds+'T00:00:00'); return d.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}); }
function show(id){ document.getElementById(id)?.classList.remove('hidden'); }
function hide(id){ document.getElementById(id)?.classList.add('hidden'); }
function openSheet(id){ document.getElementById(id).classList.add('open'); document.body.style.overflow='hidden'; }
function closeSheet(id){ document.getElementById(id).classList.remove('open'); document.body.style.overflow=''; }
function closeModal(id){ document.getElementById(id).classList.remove('open'); document.body.style.overflow=''; }
function openModal(id){ document.getElementById(id).classList.add('open'); document.body.style.overflow='hidden'; }
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}
function waLink(phone, msg){ return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`; }
function copyPix(elId, btn){
  const txt=document.getElementById(elId)?.textContent?.trim();
  if(!txt) return;
  navigator.clipboard.writeText(txt).then(()=>{
    const orig=btn.textContent; btn.textContent='✅'; btn.disabled=true;
    setTimeout(()=>{ btn.textContent=orig; btn.disabled=false; },2000);
  }).catch(()=>toast('⚠️ Não foi possível copiar'));
}
function getServIcon(nome){
  const s=[...servicos,...servicosAll].find(x=>x.nome===nome);
  return s?.icone||SERV_ICONS[nome]||'💅';
}
function admRenderIconePicks(){
  const picks=['💅','🧴','🔧','🔄','🤍','🎨','🛡️','💎','✨','💆','💄','👑','🌸','🎀','💗','🌷','⭐','💫','🦋','🍓','🌺','💖','🪷','🫧'];
  const el=document.getElementById('sv-icone-picks'); if(!el) return;
  el.innerHTML=picks.map(e=>`<span onclick="document.getElementById('sv-icone').value='${e}'" style="font-size:1.25rem;cursor:pointer;padding:3px;border-radius:6px" onmouseenter="this.style.background='var(--s3)'" onmouseleave="this.style.background=''">${e}</span>`).join('');
}

// ── AUTH ──
async function loginGoogle(){
  const{error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname,queryParams:{prompt:'select_account'}}});
  if(error) toast('Erro: '+error.message);
}
async function logout(){ await sb.auth.signOut(); location.reload(); }
async function loadProfile(){
  const{data}=await sb.from('profiles').select('*').eq('id',user.id).single();
  profile=data;
}
// Favoritos (localStorage)
function getFavs(){ try{ return JSON.parse(localStorage.getItem('ffiuza_favs')||'[]'); }catch(e){ return []; } }
function isFav(id){ return getFavs().includes(id); }
function toggleFav(id, e){
  e.stopPropagation();
  const favs=getFavs(), idx=favs.indexOf(id);
  if(idx>=0) favs.splice(idx,1); else favs.push(id);
  localStorage.setItem('ffiuza_favs',JSON.stringify(favs));
  bkRenderServs(); renderHomeServs();
}
function renderHomeServs(){
  const el=document.getElementById('home-servs'); if(!el) return;
  const favs=getFavs();
  const sorted=[...servicos].sort((a,b)=>(isFav(b.id)?1:0)-(isFav(a.id)?1:0)||a.nome.localeCompare(b.nome));
  el.innerHTML=sorted.map(s=>`
    <div class="serv-pill" onclick="cliIrAgendar('${s.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="sp-icon">${getServIcon(s.nome)}</div>
        <button onclick="toggleFav('${s.id}',event)" style="background:none;border:none;cursor:pointer;font-size:.95rem;padding:0;line-height:1">${isFav(s.id)?'⭐':'☆'}</button>
      </div>
      <div class="sp-name">${s.nome}</div>
      <div class="sp-price">${fmtMoney(s.preco)}</div>
    </div>`).join('');
}

async function admFetchServicosAll(){
  const{data}=await sb.from('servicos').select('*').order('nome');
  servicosAll=data||[];
}
async function fetchServs(){
  const{data,error}=await sb.from('servicos').select('*').order('nome');
  if(error) console.error('fetchServs:',error);
  // Deduplica por nome (mantém o primeiro de cada nome)
  const seen=new Set();
  const dedup=(list)=>list.filter(s=>{if(seen.has(s.nome))return false;seen.add(s.nome);return true;});
  servicosAll=dedup(data||[]);
  seen.clear();
  servicos=dedup((data||[]).filter(s=>s.ativo!==false));
}
async function fetchSalonConfig(){
  try{
    const{data}=await sb.from('salon_config').select('*').single();
    salonConfig=data||{horarios:HORARIOS,info:{}};
    salonConfig.info={...DEFAULT_INFO,...(salonConfig.info||{})};
  }catch(e){ salonConfig={horarios:HORARIOS,info:{...DEFAULT_INFO}}; }
}
function getSI(){ return salonConfig?.info||DEFAULT_INFO; }
async function init(){
  const{data:{session}}=await sb.auth.getSession();
  if(session){ user=session.user; await loadProfile(); hide('screen-loading'); route(); }
  else { hide('screen-loading'); show('screen-login'); }
  sb.auth.onAuthStateChange(async(_,session)=>{
    if(session&&!user){ user=session.user; await loadProfile(); hide('screen-loading'); hide('screen-login'); route(); }
  });
}
function route(){
  if(!profile){ show('screen-login'); return; }
  Promise.all([fetchServs(),fetchSalonConfig()]).then(()=>{
    if(profile.role==='admin') initAdmin();
    else initCliente();
  });
}

// ── PHONE ──
async function salvarTelefone(){
  const tel=document.getElementById('phone-input').value.trim();
  if(!tel){ toast('⚠️ Digite seu WhatsApp'); return; }
  await sb.from('profiles').update({tel}).eq('id',user.id);
  profile.tel=tel;
  hide('modal-phone');
  toast('✅ Salvo!');
}

// ════════════════════════════════
// CLIENTE
// ════════════════════════════════
function initCliente(){
  show('app-cliente');
  const nome=profile?.nome||user.email;
  document.getElementById('cli-nome-top').textContent=nome.split(' ')[0];
  document.getElementById('cli-date-top').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('cli-pnome').textContent=nome;
  document.getElementById('cli-pemail').textContent=user.email;
  document.getElementById('cli-ptel').value=profile?.tel||'';
  const av=user.user_metadata?.avatar_url;
  if(av){
    document.getElementById('cli-av').innerHTML=`<img src="${av}">`;
    document.getElementById('cli-pav').innerHTML=`<img src="${av}" style="width:100%;height:100%;object-fit:cover">`;
  }
  // Obrigar telefone
  if(!profile?.tel){ show('modal-phone'); }
  cliTab('home');
  initClienteRealtime();
}

const CLI_TABS=['home','agendar','salon','historico','perfil','success'];

function cliIrAgendar(servId){
  CLI_TABS.forEach(t=>{ hide('cli-'+t); document.getElementById('cntab-'+t)?.classList.remove('active'); });
  show('cli-agendar');
  document.getElementById('cntab-agendar')?.classList.add('active');
  bkInit(servId);
}

function cliTab(tab){
  CLI_TABS.forEach(t=>{ hide('cli-'+t); document.getElementById('cntab-'+t)?.classList.remove('active'); });
  show('cli-'+tab);
  document.getElementById('cntab-'+tab)?.classList.add('active');
  if(tab==='home')      cliRenderHome();
  if(tab==='agendar')   bkInit(null);
  if(tab==='salon')     initSalonPage();
  if(tab==='historico') cliRenderHist();
  if(tab==='perfil')    document.getElementById('cli-ptel').value=profile?.tel||'';
}

async function cliRenderHome(){
  // Serviços com favoritos
  renderHomeServs();

  // Agendamentos
  const{data}=await sb.from('agendamentos')
    .select('*,servico:servicos(nome,preco)')
    .eq('cliente_id',user.id).gte('data',todayStr()).neq('status','cancelado')
    .order('data').order('hora');

  const proxEl=document.getElementById('cli-proximo');
  const futWrap=document.getElementById('cli-futuros-wrap');
  const futEl=document.getElementById('cli-futuros');

  if(!data||data.length===0){
    proxEl.innerHTML=`<div class="card" style="text-align:center;padding:28px">
      <div style="font-size:2.5rem;margin-bottom:10px">💅</div>
      <div style="font-weight:800;font-size:1rem;margin-bottom:4px">Nenhum agendamento</div>
      <div style="font-size:.82rem;color:var(--t2)">Agende seu horário com a Fabiana!</div>
    </div>`;
    futWrap.classList.add('hidden'); return;
  }
  const[next,...rest]=data;
  const nd=new Date(next.data+'T00:00:00');
  const dow=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][nd.getDay()];
  const isPend=next.status==='pendente';
  const si=getSI();
  const pixKey=si.whatsapp?.replace(/^55(\d{2})(\d{5})(\d{4})$/,'($1) $2-$3')||FABIANA_PIX;
  proxEl.innerHTML=`<div class="next-card ${isPend?'pend':''}">
    <div class="nc-lbl">${isPend?'⏳ Aguardando confirmação':'Próximo agendamento'}</div>
    <div class="nc-serv">${resolveServNomes(next,servicos)}</div>
    <div class="nc-meta">${dow}, ${fmtDate(next.data)} · ${fmtH(next.hora)} · ${fmtMoney(next.valor||next.servico?.preco)}</div>
    ${isPend?`<div class="pix-notice">
      <span class="pnt">⚠️ Seu horário ainda não está confirmado</span>
      O Pix de sinal de R$ ${SINAL_VALOR},00 ainda não foi verificado. Assim que Fabiana confirmar o recebimento, seu agendamento será aprovado.
      <div style="margin-top:7px;opacity:.8;font-size:.76rem">Chave Pix: <strong>${pixKey}</strong></div>
    </div>
    <button class="nc-cancel" onclick="cliCancelar('${next.id}')">Cancelar solicitação</button>`
    :`<button class="nc-cancel" onclick="cliCancelar('${next.id}')">Cancelar agendamento</button>`}
  </div>`;
  if(rest.length>0){
    futWrap.classList.remove('hidden');
    futEl.innerHTML=rest.map(a=>{
      const d2=new Date(a.data+'T00:00:00');
      const dw=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d2.getDay()];
      const stBadge=a.status==='pendente'?`<span class="badge badge-gold" style="font-size:.62rem">⏳ Pix pendente</span>`:'';
      return `<div class="appt-row">
        <div class="appt-dot ${a.status}"></div>
        <div class="ar-info"><div class="an">${resolveServNomes(a,servicos)}</div><div class="am">${dw}, ${fmtDate(a.data)} · ${fmtH(a.hora)}</div>${stBadge}</div>
        <div class="ar-val">${fmtMoney(a.valor||a.servico?.preco)}</div>
      </div>`;
    }).join('');
  } else futWrap.classList.add('hidden');
}

async function cliCancelar(id){
  const{data:appt}=await sb.from('agendamentos').select('data,status').eq('id',id).single();
  if(!appt||appt.data<todayStr()){toast('⚠️ Não é possível cancelar agendamento passado');return;}
  if(!['agendado','pendente'].includes(appt.status)){toast('⚠️ Este agendamento não pode ser cancelado');return;}
  if(!confirm('Cancelar este agendamento?')) return;
  await sb.from('agendamentos').update({status:'cancelado'}).eq('id',id);
  toast('Agendamento cancelado'); cliRenderHome();
}

async function cliRenderHist(){
  const{data}=await sb.from('agendamentos')
    .select('*,servico:servicos(nome,preco)')
    .eq('cliente_id',user.id)
    .order('data',{ascending:false}).order('hora',{ascending:false});
  const el=document.getElementById('cli-hist');

  // Cartão fidelidade
  const fidWrap=document.getElementById('cli-fid-wrap');
  if(fidWrap){
    const concluidos=(data||[]).filter(a=>a.status==='concluido');
    const total=concluidos.length;
    const ciclo=total%5;
    const ganhos=Math.floor(total/5);
    const resgatados=profile?.premios_resgatados||0;
    const disponiveis=Math.max(0,ganhos-resgatados);
    const stampsDone=ciclo===0&&total>0?5:ciclo;
    const stampsHtml=Array.from({length:5},(_,i)=>
      `<div class="fid-stamp ${i<stampsDone?'done':''}">${i<stampsDone?'💅':''}</div>`
    ).join('');
    // Toast de celebração na primeira vez que detecta novo prêmio disponível
    if(disponiveis>0){
      const seenKey=`fid_prize_seen_${user?.id}_${ganhos}`;
      if(!localStorage.getItem(seenKey)){
        localStorage.setItem(seenKey,'1');
        setTimeout(()=>toast(`🎉 Parabéns! Você ganhou uma Decoração gratuita!`),600);
      }
    }
    fidWrap.innerHTML=`
      ${disponiveis>0?`<div class="fid-award-banner">
        <div style="font-size:2.2rem;line-height:1;flex-shrink:0">🎉</div>
        <div class="fid-award-info">
          <strong>Você tem ${disponiveis} Decoraç${disponiveis>1?'ões':'ão'} gratuita${disponiveis>1?'s':''}!</strong>
          <span>Envie uma mensagem para a Fabiana para agendar seu prêmio 💅</span>
          <a href="https://wa.me/5531985386404?text=${encodeURIComponent(`Olá Fabiana! 🎉 Completei meus atendimentos e ganhei ${disponiveis===1?'uma Decoração gratuita':''+disponiveis+' Decorações gratuitas'}! Gostaria de agendar para usar meu prêmio! 💅`)}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:rgba(0,0,0,.18);border-radius:10px;padding:8px 14px;text-decoration:none;color:#3a1c00;font-weight:800;font-size:.8rem">
            📲 Avisar Fabiana
          </a>
        </div>
      </div>`:''}
      <div class="fid-card" style="margin-bottom:14px">
        <div class="fid-title">Cartão Fidelidade · Fiuza Nails</div>
        <div class="fid-subtitle">💅 Ganhe 1 Decoração a cada 5 atendimentos</div>
        <div class="fid-stamps">${stampsHtml}</div>
        <div class="fid-progress">${stampsDone} de 5 atendimentos${
          ganhos>0?` · ${ganhos} ganho${ganhos>1?'s':''}`:''
        }${resgatados>0?` · ${resgatados} resgatado${resgatados>1?'s':''}`:''}</div>
      </div>`;
  }

  if(!data||data.length===0){ el.innerHTML='<div class="empty"><div class="ei">📋</div><p>Nenhum agendamento ainda</p></div>'; return; }
  el.innerHTML=data.map(a=>{
    const d=new Date(a.data+'T00:00:00');
    const dw=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
    const bc=a.status==='concluido'?'badge-green':a.status==='cancelado'?'badge-red':a.status==='pendente'?'badge-gold':a.status==='faltante'?'badge-gray':'badge-tan';
    const bl=a.status==='concluido'?'✅ Concluído':a.status==='cancelado'?'Cancelado':a.status==='pendente'?'⏳ Aguardando Pix':a.status==='faltante'?'👻 Faltou':'Agendado';
    const restante=a.status==='pendente'?`<div style="font-size:.7rem;color:var(--goldt);margin-top:2px">Sinal: R$${SINAL_VALOR} · Restante: ${fmtMoney(Math.max(0,(a.servico?.preco||0)-SINAL_VALOR))}</div>`:'';
    return `<div class="appt-row">
      <div class="appt-dot ${a.status}"></div>
      <div class="ar-info"><div class="an">${resolveServNomes(a,servicos)}</div><div class="am">${dw}, ${fmtDate(a.data)} · ${fmtH(a.hora)}</div>${restante}</div>
      <div style="text-align:right"><span class="badge ${bc}">${bl}</span><div style="font-weight:800;color:var(--pdk);font-size:.86rem;margin-top:3px">${fmtMoney(a.valor||a.servico?.preco)}</div></div>
    </div>`;
  }).join('');
}

async function cliSalvarPerfil(){
  const tel=document.getElementById('cli-ptel').value.trim();
  const{error}=await sb.from('profiles').update({tel}).eq('id',user.id);
  if(error){toast('Erro ao salvar: '+error.message);return;}
  profile.tel=tel; toast('✅ Perfil salvo!');
}

// ── BOOKING FLOW ──
function bkSelPag(nome, chipId){
  bkPagamento=nome;
  document.querySelectorAll('.pag-chip').forEach(c=>c.classList.remove('sel'));
  document.getElementById(chipId)?.classList.add('sel');
}

function bkInit(preSelId=null){
  bkServs=[]; bkData=null; bkHora=null; bkPagamento=null; bkMonth=new Date();
  bkReset();
  if(servicos.length>0){
    bkRenderServs();
    if(preSelId) setTimeout(()=>bkToggleServ(preSelId),100);
  } else {
    fetchServs().then(()=>{ bkRenderServs(); if(preSelId) setTimeout(()=>bkToggleServ(preSelId),100); });
  }
}

function bkReset(){
  [1,2,3,4].forEach(i=>{
    const h=document.getElementById('bk-h'+i);
    const b=document.getElementById('bk-b'+i);
    const n=document.getElementById('bk-n'+i);
    const s=document.getElementById('bk-s'+i);
    if(i===1){ h.classList.remove('done'); n.className='bk-step-num active'; b.classList.remove('closed'); s.style.opacity='1'; s.style.pointerEvents=''; }
    else { n.className='bk-step-num'; b.classList.add('closed'); s.style.opacity='.5'; s.style.pointerEvents='none'; }
    const v=document.getElementById('bk-v'+i); if(v) v.textContent=''; // bk-v4 é opcional
  });
}

function bkActivate(step){
  const s=document.getElementById('bk-s'+step);
  const n=document.getElementById('bk-n'+step);
  const b=document.getElementById('bk-b'+step);
  s.style.opacity='1'; s.style.pointerEvents='';
  n.className='bk-step-num active';
  b.classList.remove('closed');
  // Scroll to it
  setTimeout(()=>s.scrollIntoView({behavior:'smooth',block:'start'}),80);
}

function bkDone(step, label){
  const h=document.getElementById('bk-h'+step);
  const n=document.getElementById('bk-n'+step);
  document.getElementById('bk-v'+step).textContent=label;
  n.className='bk-step-num done'; n.textContent='✓';
  h.classList.add('done');
}

function bkTotalDur(){
  return bkServs.reduce((sum,s)=>s.nome==='Decoração completa'?sum:sum+(s.duracao||60),0)||60;
}
function bkTotalPreco(){
  return bkServs.reduce((sum,s)=>sum+s.preco,0);
}
function resolveServNomes(a,arr){
  if(a.servicos_ids&&a.servicos_ids.length>1){
    const nomes=a.servicos_ids.map(id=>(arr||[]).find(s=>s.id===id)?.nome).filter(Boolean);
    if(nomes.length) return nomes.join(' + ');
  }
  return a.servico?.nome||'—';
}

function bkUpdateServBar(){
  const bar=document.getElementById('bk-serv-bar'); if(!bar) return;
  if(!bkServs.length){ bar.style.display='none'; return; }
  bar.style.display='flex';
  const dur=bkTotalDur();
  const hrs=Math.floor(dur/60), mins=dur%60;
  const durStr=hrs>0?(mins>0?`${hrs}h ${mins}min`:`${hrs}h`):`${mins}min`;
  const label=bkServs.length===1?bkServs[0].nome:`${bkServs.map(s=>s.nome).join(' + ')}`;
  document.getElementById('bk-bar-label').textContent=label;
  document.getElementById('bk-bar-dur').textContent=`⏱️ ${durStr} · ${fmtMoney(bkTotalPreco())} total`;
}

function bkRenderServs(){
  const selIds=new Set(bkServs.map(s=>s.id));
  const sorted=[...servicos].sort((a,b)=>(isFav(b.id)?1:0)-(isFav(a.id)?1:0)||a.nome.localeCompare(b.nome));
  document.getElementById('bk-servs').innerHTML=sorted.map(s=>`
    <div class="so ${selIds.has(s.id)?'sel':''}" onclick="bkToggleServ('${s.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div class="soi" style="margin-bottom:0">${getServIcon(s.nome)}</div>
        <button onclick="toggleFav('${s.id}',event)" style="background:none;border:none;cursor:pointer;font-size:.9rem;padding:0;line-height:1">${isFav(s.id)?'⭐':'☆'}</button>
      </div>
      <div class="son">${s.nome}</div>
      <div class="sop">${fmtMoney(s.preco)}</div>
      ${s.duracao?`<div class="sod">${s.duracao}min${s.nome==='Decoração completa'?' · incluso no tempo':''}</div>`:''}
    </div>`).join('');
  bkUpdateServBar();
}

function bkToggleServ(id){
  const s=servicos.find(x=>x.id===id); if(!s) return;
  const idx=bkServs.findIndex(x=>x.id===id);
  if(idx>=0) bkServs.splice(idx,1); else bkServs.push(s);
  bkRenderServs();
  // Se já avançou do passo 1, atualizar label e verificar horário
  const h1=document.getElementById('bk-h1');
  if(h1&&h1.classList.contains('done')&&bkServs.length){
    const label=bkServs.length===1?bkServs[0].nome:`${bkServs.length} serviços`;
    bkDone(1,label);
    if(bkData&&bkHora) bkValidarHoraAposServico();
  }
}

async function bkValidarHoraAposServico(){
  const horarios=getHorariosData(bkData);
  const dur=bkTotalDur();
  const slots=Math.ceil(dur/60);

  const{data:ocp}=await sb.from('agendamentos')
    .select('hora,servico:servicos(duracao)')
    .eq('data',bkData).neq('status','cancelado');

  const takenH=new Set();
  (ocp||[]).forEach(a=>{
    const d=a.servico?.duracao||60;
    const sh=Math.ceil(d/60);
    const hh=parseInt(a.hora.split(':')[0]);
    for(let i=0;i<sh;i++) takenH.add(hh+i);
  });

  const hh=parseInt(bkHora.split(':')[0]);
  let valid=horarios.includes(bkHora);
  if(valid){
    for(let i=0;i<slots;i++){
      if(takenH.has(hh+i)){valid=false;break;}
    }
  }

  if(valid){
    // Horário ainda serve — só atualiza o preço na confirmação
    const b4=document.getElementById('bk-b4');
    if(b4&&!b4.classList.contains('closed')) bkRenderConfirm();
  } else {
    // Horário insuficiente — volta ao passo 3
    bkHora=null;
    toast('⚠️ Serviços alterados — escolha um novo horário');
    ['bk-n3','bk-n4'].forEach((nid,i)=>{const n=document.getElementById(nid);if(n){n.className='bk-step-num';n.textContent=i===0?'3':'4';}});
    ['bk-h3','bk-h4'].forEach(hid=>{const h=document.getElementById(hid);if(h)h.classList.remove('done');});
    ['bk-v3','bk-v4'].forEach(vid=>{const v=document.getElementById(vid);if(v)v.textContent='';});
    const s4=document.getElementById('bk-s4');if(s4){s4.style.opacity='.5';s4.style.pointerEvents='none';}
    const b4=document.getElementById('bk-b4');if(b4)b4.classList.add('closed');
    bkActivate(3);
    await bkRenderTimes();
  }
}

function bkAvancarServs(){
  if(!bkServs.length){ toast('⚠️ Selecione pelo menos 1 serviço'); return; }
  const obs=getSI().obs_servicos||'';
  const noticeEl=document.getElementById('bk-obs-notice');
  const noticeText=document.getElementById('bk-obs-notice-text');
  if(noticeEl&&noticeText){ noticeEl.style.display=obs?'':'none'; noticeText.textContent=obs; }
  const label=bkServs.length===1?bkServs[0].nome:`${bkServs.length} serviços`;
  bkDone(1, label);
  bkActivate(2);
  bkRenderDates();
}

function bkRenderDates(){
  const m=bkMonth.getMonth(), y=bkMonth.getFullYear();
  document.getElementById('bk-month-lbl').textContent=`${MESES[m]} ${y}`;
  const dns=['D','S','T','Q','Q','S','S'];
  document.getElementById('bk-cal-dns').innerHTML=dns.map(d=>`<div class="cal-dn">${d}</div>`).join('');
  const days=new Date(y,m+1,0).getDate();
  const fd=new Date(y,m,1).getDay();
  // Minimum 24hrs advance: a day is unavailable if its last slot is within 24hrs from now
  const minTime=new Date(); minTime.setTime(minTime.getTime()+24*60*60*1000);
  let html='';
  for(let i=0;i<fd;i++) html+='<div></div>';
  for(let d=1;d<=days;d++){
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const diaHors=getHorariosData(ds);
    const lastHr=diaHors[diaHors.length-1]||null;
    const[lh,lm]=lastHr?lastHr.split(':').map(Number):[23,59];
    const lastSlotDt=new Date(y,m,d,lh,lm);
    const off=!diaHors.length||lastSlotDt<=minTime;
    const sel=bkData===ds;
    html+=`<div class="cal-day ${sel?'sel':''} ${off?'off':''}" onclick="${off?'':'bkSelData(\''+ds+'\')'}">${d}</div>`;
  }
  document.getElementById('bk-cal').innerHTML=html;
}

function bkSelData(ds){
  bkData=ds; bkHora=null;
  bkRenderDates();
  const d=new Date(ds+'T00:00:00');
  const dow=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
  const lbl=`${dow}, ${fmtDate(ds)}`;
  // Auto-advance to times
  setTimeout(async()=>{
    bkDone(2, lbl);
    bkActivate(3);
    await bkRenderTimes();
  },200);
}

function bkMonthChange(dir){ bkMonth=new Date(bkMonth.getFullYear(),bkMonth.getMonth()+dir,1); bkRenderDates(); }

async function bkRenderTimes(){
  const horarios=getHorariosData(bkData);
  const curDur=bkTotalDur();
  const curSlots=Math.ceil(curDur/60);

  // Fetch booked appts WITH service duration for duration-aware blocking
  const{data:ocp}=await sb.from('agendamentos')
    .select('hora,servico:servicos(duracao)')
    .eq('data',bkData).neq('status','cancelado');

  // Build set of blocked hour integers (e.g., 10 blocks 10:00)
  const takenH=new Set();
  (ocp||[]).forEach(a=>{
    const dur=a.servico?.duracao||60;
    const slotsNeeded=Math.ceil(dur/60);
    const hh=parseInt(a.hora.split(':')[0]);
    for(let i=0;i<slotsNeeded;i++) takenH.add(hh+i);
  });

  // 24hrs minimum: slot datetime must be > now + 24h
  const minTime=new Date(); minTime.setTime(minTime.getTime()+24*60*60*1000);

  document.getElementById('bk-times').innerHTML=horarios.map(h=>{
    const hh=parseInt(h.split(':')[0]);

    // Check if any of the needed consecutive slots is already taken
    let blocked=false;
    for(let i=0;i<curSlots;i++){
      if(takenH.has(hh+i)){blocked=true;break;}
    }

    // 24hrs advance check
    const slotDt=new Date(bkData+'T'+h+':00');
    if(slotDt<=minTime) blocked=true;

    const sel=bkHora===h;
    return `<div class="tb ${sel?'sel':''} ${blocked&&!sel?'taken':''}" onclick="${blocked?'':'bkSelHora(\''+h+'\')'}">
      ${blocked&&!sel?`<span style="font-size:.9rem">🚫</span><br>${h}`:h}</div>`;
  }).join('');
}

function bkSelHora(h){
  bkHora=h; bkRenderTimes();
  setTimeout(()=>{
    bkDone(3, h);
    bkActivate(4);
    bkRenderConfirm();
  },200);
}

function bkRenderConfirm(){
  const d=new Date(bkData+'T00:00:00');
  const totalPreco=bkTotalPreco();
  const restante=Math.max(0,totalPreco-SINAL_VALOR);
  const servLabel=bkServs.map(s=>s.nome).join(' + ');
  document.getElementById('cf-serv').textContent=servLabel||'—';
  const sinalEl=document.getElementById('cf-sinal'); if(sinalEl) sinalEl.textContent=`− ${fmtMoney(SINAL_VALOR)}`;
  const restEl=document.getElementById('cf-restante'); if(restEl) restEl.textContent=fmtMoney(restante);
  document.getElementById('cf-data').textContent=d.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('cf-hora').textContent=bkHora;
  document.getElementById('cf-val').textContent=fmtMoney(totalPreco);
  const pkEl=document.getElementById('bk-pix-key'); if(pkEl) pkEl.textContent=FABIANA_PIX;
  bkPagamento=null;
  document.querySelectorAll('.pag-chip').forEach(c=>c.classList.remove('sel'));
  document.getElementById('bk-obs').value='';
  const n=document.getElementById('bk-n4'); n.className='bk-step-num active'; n.textContent='4';
}

async function bkConfirm(){
  if(!bkPagamento){ toast('⚠️ Escolha a forma de pagamento para o restante'); return; }
  if(!bkServs.length){ toast('⚠️ Nenhum serviço selecionado'); return; }

  const totalPreco=bkTotalPreco();
  const totalDur=bkTotalDur();
  const restante=Math.max(0,totalPreco-SINAL_VALOR);
  const servLabel=bkServs.map(s=>s.nome).join(' + ');
  const servLineList=bkServs.map(s=>`  • ${s.nome} — ${fmtMoney(s.preco)}`).join('\n');

  const obs=document.getElementById('bk-obs').value;
  const dataFmt=new Date(bkData+'T00:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const msgSalon=`Olá Fabiana! 😊 *Novo pedido de agendamento — aguardando Pix:*\n\n👤 *${profile.nome}*\n💅 *Serviço(s):*\n${servLineList}\n📅 ${fmtDate(bkData)} às ${bkHora}\n⏱️ ${totalDur} min\n💰 Total: ${fmtMoney(totalPreco)}\n💸 Sinal Pix: *R$ ${SINAL_VALOR},00* (aguardando)\n💰 Restante no dia: ${fmtMoney(restante)}\n💳 Pagamento restante: *${bkPagamento}*\n📱 Fone: ${profile.tel||'não informado'}${obs?'\n📝 Obs: '+obs:''}\n\n_Via Fiuza Nails App_ 💅`;
  const clientePhone=(profile.tel||'').replace(/\D/g,'');
  const msgCliente=`Olá ${profile.nome.split(' ')[0]}! 😊 Recebemos seu pedido de agendamento na *Fiuza Nails* 💅\n\n💅 *${servLabel}*\n📅 ${fmtDate(bkData)} às ${bkHora}\n💸 Sinal Pix: *R$ ${SINAL_VALOR},00* — aguardando verificação\n💰 Restante no dia: *${fmtMoney(restante)}*\n💳 Pagamento restante: *${bkPagamento}*\n\nAssim que confirmarmos o Pix, seu horário estará reservado! ✨\n_@ffiuza_nails_`;
  const waSalonHref=waLink(FABIANA_PHONE,msgSalon);
  const waCliHref=clientePhone?waLink('55'+clientePhone,msgCliente):waSalonHref;

  window.open(waSalonHref,'_blank');

  const btn=document.getElementById('bk-cf-btn'); btn.disabled=true;
  const{error}=await sb.from('agendamentos').insert({
    cliente_id:user.id,
    servico_id:bkServs[0].id,
    servicos_ids:bkServs.map(s=>s.id),
    data:bkData, hora:bkHora+':00',
    valor:totalPreco, status:'pendente', obs, sinal_pago:false
  });
  btn.disabled=false;
  if(error){ toast('Erro ao salvar: '+error.message); return; }

  document.getElementById('sc-serv').textContent=servLabel;
  document.getElementById('sc-data').textContent=dataFmt;
  document.getElementById('sc-hora').textContent=bkHora;
  document.getElementById('sc-val').textContent=fmtMoney(totalPreco);
  document.getElementById('sc-sinal').textContent=`R$ ${SINAL_VALOR},00`;
  document.getElementById('sc-restante').textContent=fmtMoney(restante);
  document.getElementById('sc-pag').textContent=bkPagamento;
  document.getElementById('wa-salon-link').href=waSalonHref;

  CLI_TABS.forEach(t=>{ hide('cli-'+t); document.getElementById('cntab-'+t)?.classList.remove('active'); });
  show('cli-success');
  document.getElementById('cntab-home')?.classList.add('active');
}

// ════════════════════════════════
// ADMIN
// ════════════════════════════════
function initAdmin(){
  show('app-admin');
  const nome=profile?.nome||user.email;
  const h=new Date().getHours();
  const g=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  document.getElementById('adm-greet').textContent=`${g}, ${nome.split(' ')[0]}! 💅`;
  document.getElementById('adm-date').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('adm-pnome').textContent=nome;
  document.getElementById('adm-pemail').textContent=user.email;
  const FABIANA_FOTO='fabiana.jpg';
  document.getElementById('adm-av').innerHTML=`<img src="${FABIANA_FOTO}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.textContent='👸'">`;
  document.getElementById('adm-pav').innerHTML=`<img src="${FABIANA_FOTO}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='👸'">`;
  admRenderDash();
  initNotifications();
  checkNoShows();
}

function admTab(tab,el){
  ['dashboard','agenda','clientes','servicos','perfil'].forEach(t=>{ hide('adm-'+t); document.getElementById('antab-'+t)?.classList.remove('active'); });
  show('adm-'+tab); el?.classList.add('active');
  const fab=document.getElementById('adm-fab');
  if(fab){ fab.className='fab'+((['agenda','servicos'].includes(tab))?'':' hidden'); }
  if(tab==='dashboard') admRenderDash();
  if(tab==='agenda')    admRenderAgenda();
  if(tab==='clientes')  admRenderClis();
  if(tab==='servicos')  { admRenderServs(); admRenderSalonInfo(); }
  if(tab==='perfil')    { finTab('hoje',document.getElementById('ftab-hoje')); }
}
function admFabClick(){
  const tab=document.querySelector('.nav-tab.active[id^="antab-"]')?.id?.replace('antab-','');
  if(tab==='agenda') admOpenAgend();
  else if(tab==='servicos') admOpenServ();
}

function getHorariosData(dateStr){
  const perData=getSI().horarios_por_data||{};
  if(Object.prototype.hasOwnProperty.call(perData,dateStr)) return perData[dateStr]||[];
  const dow=new Date(dateStr+'T00:00:00').getDay();
  const perDia=getSI().horarios_por_dia||{};
  if(Object.prototype.hasOwnProperty.call(perDia,dow)) return perDia[dow]||[];
  return []; // dia sem configuração = fechado
}

function admRenderHorCal(){
  const m=admHorMonth.getMonth(), y=admHorMonth.getFullYear();
  document.getElementById('adm-hor-month-lbl').textContent=`${MESES[m]} ${y}`;
  const perData=getSI().horarios_por_data||{};
  const perDia=getSI().horarios_por_dia||{};
  const days=new Date(y,m+1,0).getDate();
  const fd=new Date(y,m,1).getDay();
  const td=todayStr();
  let html='';
  for(let i=0;i<fd;i++) html+='<div></div>';
  for(let d=1;d<=days;d++){
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow=new Date(ds+'T00:00:00').getDay();
    const hasCustom=Object.prototype.hasOwnProperty.call(perData,ds);
    const hasDow=!hasCustom&&Object.prototype.hasOwnProperty.call(perDia,dow);
    const isFechado=hasCustom&&(perData[ds]||[]).length===0;
    const sel=admHorData===ds;
    const isPast=ds<td;
    const dotColor=isFechado?'var(--red)':'var(--primary)';
    html+=`<div onclick="admSelHorData('${ds}')" style="
      padding:7px 2px;text-align:center;border-radius:8px;cursor:pointer;font-size:.8rem;
      font-weight:${sel?900:600};position:relative;
      background:${sel?'var(--primary)':hasCustom?'var(--goldl)':hasDow?'var(--s3)':'transparent'};
      color:${sel?'#fff':isPast?'var(--t3)':isFechado?'var(--red)':hasCustom?'var(--goldt)':'var(--text)'};
      border:1.5px solid ${sel?'var(--primary)':hasCustom?'var(--gold)':hasDow?'var(--primary)':'transparent'};
    ">${d}${hasCustom&&!sel?`<div style="width:4px;height:4px;border-radius:50%;background:${dotColor};position:absolute;bottom:2px;left:50%;transform:translateX(-50%)"></div>`:''}
    </div>`;
  }
  document.getElementById('adm-hor-cal').innerHTML=html;
}

function admSelHorData(ds){
  admHorData=ds;
  admRenderHorCal();
  const d=new Date(ds+'T00:00:00');
  const dow=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
  const[y,mm,dd]=ds.split('-');
  document.getElementById('adm-hor-data-lbl').textContent=`${dow}, ${dd}/${mm}/${y}`;
  document.getElementById('adm-hor-data-wrap').style.display='';
  const perData=getSI().horarios_por_data||{};
  const hasCustom=Object.prototype.hasOwnProperty.call(perData,ds);
  const customHors=hasCustom?perData[ds]||[]:null;
  const ativo=!hasCustom||(customHors.length>0);
  document.getElementById('dia-ativo').checked=ativo;
  const dowDs=new Date(ds+'T00:00:00').getDay();
  const perDia=getSI().horarios_por_dia||{};
  const dayHors=Object.prototype.hasOwnProperty.call(perDia,dowDs)?perDia[dowDs]||[]:[];
  const activeSet=hasCustom?new Set(customHors):new Set(dayHors);
  document.getElementById('adm-hor-grid').innerHTML=ALL_HORARIOS.map(h=>`
    <div class="hor-btn ${activeSet.has(h)?'on':''}" onclick="this.classList.toggle('on')">${h}</div>
  `).join('');
}

function admHorMonthChange(dir){
  admHorMonth=new Date(admHorMonth.getFullYear(),admHorMonth.getMonth()+dir,1);
  admRenderHorCal();
}

async function admSalvarHorariosData(){
  if(!admHorData){toast('Selecione uma data');return;}
  const ativo=document.getElementById('dia-ativo')?.checked;
  const selected=ativo
    ?[...document.querySelectorAll('#adm-hor-grid .hor-btn.on')].map(el=>el.textContent.trim()).sort()
    :[];
  const perData={...(getSI().horarios_por_data||{}),[admHorData]:selected};
  const newInfo={...getSI(),horarios_por_data:perData};
  const{error}=await sb.from('salon_config').update({info:newInfo,updated_at:new Date().toISOString()}).eq('id',1);
  if(error){toast('Erro: '+error.message);return;}
  salonConfig={...salonConfig,info:newInfo};
  admRenderHorCal();
  const[,mm,dd]=admHorData.split('-');
  toast(`✅ Horários de ${dd}/${mm} salvos!`);
}

const DIAS_SEMANA_PT=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const DIAS_SHORT_PT=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function admRenderDowTabs(){
  const perDia=getSI().horarios_por_dia||{};
  const el=document.getElementById('adm-dow-tabs'); if(!el) return;
  // Domingo (0) não exibido — salão não funciona aos domingos
  el.innerHTML=DIAS_SHORT_PT.slice(1).map((d,idx)=>{
    const i=idx+1; // 1=Seg … 6=Sáb
    const hasCustom=Object.prototype.hasOwnProperty.call(perDia,i);
    const isSel=admHorDow===i;
    return `<div onclick="admSelHorDow(${i})" style="
      flex:1;text-align:center;padding:10px 4px;border-radius:10px;cursor:pointer;font-size:.78rem;font-weight:800;
      background:${isSel?'var(--primary)':hasCustom?'var(--goldl)':'var(--s2)'};
      color:${isSel?'#fff':hasCustom?'var(--goldt)':'var(--t2)'};
      border:1.5px solid ${isSel?'var(--primary)':hasCustom?'var(--gold)':'transparent'};
      transition:all .18s;position:relative
    ">${d}${hasCustom&&!isSel?`<div style="width:5px;height:5px;border-radius:50%;background:var(--gold);position:absolute;top:3px;right:3px"></div>`:''}</div>`;
  }).join('');
}

function admSelHorDow(dow){
  admHorDow=dow;
  admRenderDowTabs();
  document.getElementById('adm-dow-lbl').textContent=DIAS_SEMANA_PT[dow];
  document.getElementById('adm-dow-wrap').style.display='';
  const perDia=getSI().horarios_por_dia||{};
  const hasCustom=Object.prototype.hasOwnProperty.call(perDia,dow);
  const activeSet=hasCustom?new Set(perDia[dow]||[]):new Set();
  document.getElementById('adm-hor-dow-grid').innerHTML=ALL_HORARIOS.map(h=>
    `<div class="hor-btn ${activeSet.has(h)?'on':''}" onclick="this.classList.toggle('on')">${h}</div>`
  ).join('');
}

async function admSalvarHorariosSemana(){
  if(admHorDow===null){toast('Selecione um dia');return;}
  const selected=[...document.querySelectorAll('#adm-hor-dow-grid .hor-btn.on')].map(el=>el.textContent.trim()).sort();
  const perDia={...(getSI().horarios_por_dia||{}),[admHorDow]:selected};
  const newInfo={...getSI(),horarios_por_dia:perDia};
  const{error}=await sb.from('salon_config').update({info:newInfo,updated_at:new Date().toISOString()}).eq('id',1);
  if(error){toast('Erro: '+error.message);return;}
  salonConfig={...salonConfig,info:newInfo};
  admRenderDowTabs();
  admRenderHorCal();
  toast(`✅ Horários de ${DIAS_SEMANA_PT[admHorDow]} salvos!`);
}

async function admLimparDow(){
  if(admHorDow===null) return;
  const perDia={...(getSI().horarios_por_dia||{})};
  delete perDia[admHorDow];
  const newInfo={...getSI(),horarios_por_dia:perDia};
  const{error}=await sb.from('salon_config').update({info:newInfo,updated_at:new Date().toISOString()}).eq('id',1);
  if(error){toast('Erro: '+error.message);return;}
  salonConfig={...salonConfig,info:newInfo};
  toast(`🗑️ Configuração de ${DIAS_SEMANA_PT[admHorDow]} removida`);
  admSelHorDow(admHorDow);
  admRenderDowTabs();
  admRenderHorCal();
}


async function admLimparData(){
  if(!admHorData) return;
  const perData={...(getSI().horarios_por_data||{})};
  delete perData[admHorData];
  const newInfo={...getSI(),horarios_por_data:perData};
  const{error}=await sb.from('salon_config').update({info:newInfo,updated_at:new Date().toISOString()}).eq('id',1);
  if(error){toast('Erro: '+error.message);return;}
  salonConfig={...salonConfig,info:newInfo};
  const[,mm,dd]=admHorData.split('-');
  toast(`🗑️ Exceção de ${dd}/${mm} removida — seguirá o horário do dia da semana`);
  admSelHorData(admHorData);
}

function admRenderSalonInfo(){
  const si=getSI();
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.value=val||''; };
  set('si-especialidade', si.especialidade);
  set('si-bio',           si.bio);
  set('si-momento',       si.seu_momento);
  set('si-endereco',      si.endereco);
  set('si-maps',          si.maps_url);
  set('si-instagram',     si.instagram);
  set('si-whatsapp',      si.whatsapp);
  set('si-seg-sex',       si.seg_sex);
  set('si-sabado',        si.sabado);
  set('si-domingo',       si.domingo);
  set('si-obs',           si.obs_servicos);
  admRenderOrdem();
  admRenderDowTabs();
  admRenderHorCal();
}

async function admSalvarInfo(){
  const g=(id)=>document.getElementById(id)?.value?.trim()||'';
  const si=getSI();
  const info={
    ...si,
    especialidade: g('si-especialidade'),
    bio:           g('si-bio'),
    seu_momento:   g('si-momento'),
    endereco:      g('si-endereco'),
    maps_url:      g('si-maps'),
    instagram:     g('si-instagram').replace(/^@/,''),
    whatsapp:      g('si-whatsapp').replace(/\D/g,''),
    seg_sex:       g('si-seg-sex'),
    sabado:        g('si-sabado'),
    domingo:       g('si-domingo'),
    obs_servicos:  g('si-obs')
  };
  const{error}=await sb.from('salon_config').update({info,updated_at:new Date().toISOString()}).eq('id',1);
  if(error){toast('Erro: '+error.message);return;}
  salonConfig={...salonConfig,info:{...DEFAULT_INFO,...info}};
  toast('✅ Informações do salão salvas!');
}

function salonSecHtml(key, si){
  const wp=si.whatsapp||FABIANA_PHONE;
  const telFmt=wp.replace(/^55(\d{2})(\d{5})(\d{4})$/,'($1) $2-$3')||wp;
  const segSex=si.seg_sex||'09:00 – 18:00';
  const sab=si.sabado||'09:00 – 16:00';
  const dom=si.domingo||'Fechado';
  switch(key){
    case 'bio': return si.bio?`<div class="sec">Sobre Mim</div><div class="card"><p style="font-size:.88rem;color:var(--t2);line-height:1.7;margin:0">${si.bio}</p></div>`:'';
    case 'momento': return si.seu_momento?`<div class="sec">✨ Seu Momento</div><div class="card" style="background:var(--grad);border:none"><p style="font-size:.86rem;color:rgba(255,255,255,.9);line-height:1.7;margin:0;white-space:pre-line">${si.seu_momento}</p></div>`:'';
    case 'contato': return `<div class="sec">Localização & Contato</div><div class="card">
      <div class="info-row"><div class="ir-ic">📍</div><div class="ir-body"><div class="ir-lbl">Endereço</div><div class="ir-val">${(si.endereco||'').replace(/\n/g,'<br>')}</div></div><a href="${si.maps_url||'#'}" target="_blank" class="btn btn-sm btn-ghost" style="text-decoration:none;flex-shrink:0">🗺️ Maps</a></div>
      <div class="info-row"><div class="ir-ic">📱</div><div class="ir-body"><div class="ir-lbl">WhatsApp / Telefone</div><div class="ir-val">${telFmt}</div></div></div>
      <div class="info-row"><div class="ir-ic">📸</div><div class="ir-body"><div class="ir-lbl">Instagram</div><div class="ir-val">@${si.instagram||'ffiuza_nails'}</div></div></div>
    </div>`;
    case 'horarios': return `<div class="sec">Horários de Atendimento</div><div class="card">
      <div class="hours-row"><span class="hd">Segunda a Sexta</span><span class="hv">${segSex}</span></div>
      <div class="hours-row"><span class="hd">Sábado</span><span class="hv">${sab}</span></div>
      <div class="hours-row"><span class="hd">Domingo</span><span class="hv ${dom.toLowerCase().includes('fecha')?'closed':''}">${dom}</span></div>
      <div style="font-size:.74rem;color:var(--t3);margin-top:10px">⚠️ Atendimento somente com agendamento</div>
    </div>`;
    case 'pagamento': return `<div class="sec">Formas de Pagamento</div><div class="card"><div class="pag-icons"><div class="pag-icon">📱 Pix</div><div class="pag-icon">💳 Cartão de Crédito</div><div class="pag-icon">💳 Cartão de Débito</div><div class="pag-icon">💵 Dinheiro</div></div></div>`;
    case 'comodidades': return `<div class="sec">Comodidades</div><div class="card"><div class="amenity-grid"><div class="amenity-chip">🧴 Alta higiene</div><div class="amenity-chip">📅 Hora marcada</div><div class="amenity-chip">☕ Café & água</div><div class="amenity-chip">🎵 Ambiente relaxante</div><div class="amenity-chip">✨ Materiais premium</div></div></div>`;
    case 'obs': return si.obs_servicos?`<div class="sec">⚠️ Observações</div><div class="card"><p style="font-size:.82rem;color:var(--t2);line-height:1.6;margin:0">${si.obs_servicos}</p></div>`:'';
    default: return '';
  }
}

function initSalonPage(){
  const si=getSI();
  // Atualizar hero
  const espEl=document.getElementById('salon-especialidade');
  if(espEl) espEl.innerHTML=`${si.especialidade}<br>Belo Horizonte, MG · @${si.instagram||'ffiuza_nails'}`;
  const waBtn=document.getElementById('salon-wa-btn'); if(waBtn) waBtn.href='https://wa.me/'+(si.whatsapp||FABIANA_PHONE);
  const igBtn=document.getElementById('salon-ig-btn'); if(igBtn) igBtn.href='https://instagram.com/'+(si.instagram||'ffiuza_nails');
  // Renderizar seções na ordem
  const defaultOrder=SALON_SEC_DEFS.map(s=>s.key);
  const order=si.section_order||defaultOrder;
  document.getElementById('salon-content').innerHTML=order.map(k=>salonSecHtml(k,si)).join('');
}

function admRenderOrdem(){
  const si=getSI();
  const defaultOrder=SALON_SEC_DEFS.map(s=>s.key);
  const order=si.section_order||defaultOrder;
  const el=document.getElementById('adm-section-order'); if(!el) return;
  el.innerHTML=order.map((key,i)=>{
    const def=SALON_SEC_DEFS.find(s=>s.key===key)||{icon:'•',label:key};
    return `<div style="display:flex;align-items:center;gap:10px;background:var(--s2);border-radius:12px;padding:10px 12px">
      <span style="font-size:1rem">${def.icon}</span>
      <span style="flex:1;font-size:.85rem;font-weight:700">${def.label}</span>
      <button onclick="moveSec(${i},-1)" ${i===0?'disabled':''} style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--primary);padding:2px 6px;opacity:${i===0?.3:1}">↑</button>
      <button onclick="moveSec(${i},1)" ${i===order.length-1?'disabled':''} style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--primary);padding:2px 6px;opacity:${i===order.length-1?.3:1}">↓</button>
    </div>`;
  }).join('');
}

function moveSec(idx,dir){
  const si=getSI();
  const order=[...(si.section_order||SALON_SEC_DEFS.map(s=>s.key))];
  const newIdx=idx+dir;
  if(newIdx<0||newIdx>=order.length) return;
  [order[idx],order[newIdx]]=[order[newIdx],order[idx]];
  salonConfig.info={...si,section_order:order};
  admRenderOrdem();
}

async function admSalvarOrdem(){
  const si=getSI();
  const order=si.section_order||SALON_SEC_DEFS.map(s=>s.key);
  const newInfo={...si,section_order:order};
  const{error}=await sb.from('salon_config').update({info:newInfo,updated_at:new Date().toISOString()}).eq('id',1);
  if(error){toast('Erro: '+error.message);return;}
  salonConfig={...salonConfig,info:newInfo};
  toast('✅ Ordem salva!');
}

async function admRenderDash(){
  await autoCancelExpiredPending();
  const today=todayStr();
  // Pendentes (todas as datas futuras + hoje)
  const{data:pendentes}=await sb.from('agendamentos')
    .select('*,servico:servicos(nome,preco),cliente:profiles(nome,tel)')
    .eq('status','pendente').gte('data',today).order('data').order('hora');
  const pendWrap=document.getElementById('ds-pend-wrap');
  const pendList=document.getElementById('ds-pend-list');
  const pendCount=document.getElementById('ds-pend-count');
  if(pendentes&&pendentes.length){
    pendWrap?.classList.remove('hidden');
    if(pendCount) pendCount.textContent=pendentes.length;
    if(pendList) pendList.innerHTML=pendentes.map(a=>admApptHtml(a)).join('');
  } else {
    pendWrap?.classList.add('hidden');
  }
  const[{data:hoje},{count:cliCnt}]=await Promise.all([
    sb.from('agendamentos').select('*,servico:servicos(nome),cliente:profiles(nome,tel)').eq('data',today),
    sb.from('profiles').select('*',{count:'exact',head:true}).eq('role','cliente')
  ]);
  const conc=(hoje||[]).filter(a=>a.status==='concluido');
  const rec=conc.reduce((s,a)=>s+Number(a.valor||0),0);
  document.getElementById('ds-hoje').textContent=(hoje||[]).length;
  document.getElementById('ds-rec').textContent=fmtMoney(rec);
  document.getElementById('ds-conc').textContent=conc.length;
  const now=new Date(),mes=now.getMonth(),ano=now.getFullYear();
  const{data:ml}=await sb.from('agendamentos').select('valor')
    .gte('data',`${ano}-${String(mes+1).padStart(2,'0')}-01`)
    .lt('data',`${ano}-${String(mes+2).padStart(2,'0')}-01`).eq('status','concluido');
  document.getElementById('ds-mes').textContent=fmtMoney((ml||[]).reduce((s,a)=>s+Number(a.valor||0),0));
  const prox=(hoje||[]).filter(a=>a.status==='agendado'||a.status==='pendente').sort((a,b)=>a.hora.localeCompare(b.hora));
  document.getElementById('ds-list').innerHTML=prox.length
    ? prox.map(a=>admApptHtml(a)).join('')
    : '<div class="empty"><div class="ei">🌸</div><p>Nenhum agendamento hoje</p></div>';
}

async function admRenderAgenda(){
  const base=new Date(); base.setDate(base.getDate()+admWeekOff*7);
  const dow=base.getDay();
  const mon=new Date(base); mon.setDate(base.getDate()-dow+(dow===0?-6:1));
  const days=Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
  const ds0=days[0].toISOString().split('T')[0];
  const ds6=days[6].toISOString().split('T')[0];
  const fmt=d=>d.toLocaleDateString('pt-BR',{day:'numeric',month:'short'});
  document.getElementById('adm-week-lbl').textContent=`${fmt(days[0])} – ${fmt(days[6])}`;
  const{data:wk}=await sb.from('agendamentos').select('data').gte('data',ds0).lte('data',ds6).neq('status','cancelado');
  const wkSet=new Set((wk||[]).map(a=>a.data));
  const dns=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  document.getElementById('adm-week').innerHTML=days.map(d=>{
    const ds=d.toISOString().split('T')[0];
    const sel=ds===admSelDate;
    return `<div class="dc ${sel?'sel':''}" onclick="admSelDay('${ds}')">
      <div class="dn">${dns[d.getDay()]}</div>
      <div class="dd">${d.getDate()}</div>
      ${wkSet.has(ds)?'<div class="dt"></div>':'<div style="height:8px"></div>'}
    </div>`;
  }).join('');
  admRenderDayList();
}

async function admRenderDayList(){
  document.getElementById('adm-sel-date-lbl').textContent=ptDate(admSelDate);
  const{data}=await sb.from('agendamentos')
    .select('*,servico:servicos(nome),cliente:profiles(nome,tel)')
    .eq('data',admSelDate).order('hora');
  const el=document.getElementById('adm-day-list');
  if(!data||data.length===0){
    el.innerHTML=`<div class="empty"><div class="ei">📅</div><p>Nenhum agendamento</p>
      <button class="btn btn-primary" style="margin-top:12px" onclick="admOpenAgend()">+ Agendar</button></div>`;
    return;
  }
  el.innerHTML=data.map(a=>admApptHtml(a)).join('');
}

function admApptHtml(a){
  const isPend=a.status==='pendente';
  const isFalt=a.status==='faltante';
  const bc=a.status==='concluido'?'badge-green':a.status==='cancelado'?'badge-red':isPend?'badge-gold':isFalt?'badge-gray':'badge-tan';
  const bl=a.status==='concluido'?'Concluído':a.status==='cancelado'?'Cancelado':isPend?'⏳ Pix pendente':isFalt?'👻 Faltou':'Agendado';
  const wa=a.cliente?.tel?.replace(/\D/g,'');
  const servNome=resolveServNomes(a,servicosAll);
  const reminderMsg=`Olá ${(a.cliente?.nome||'').split(' ')[0]}! 😊 Lembrete do seu agendamento *amanhã* na *Fiuza Nails* 💅\n\n💅 *${servNome}*\n📅 ${fmtDate(a.data)} às ${fmtH(a.hora)}\n\nAguardamos você! ✨\n_@ffiuza_nails_`;
  const reminderBtn=wa?`<a href="${waLink('55'+wa,reminderMsg)}" target="_blank" class="btn btn-sm btn-ghost" style="text-decoration:none;padding:7px 9px" title="Lembrete WA">🔔</a>`:'';
  const restante=Math.max(0,(a.valor||a.servico?.preco||0)-SINAL_VALOR);
  const valorInfo=isPend
    ?`💅 ${servNome} · <em style="color:var(--goldt)">Sinal R$${SINAL_VALOR} aguardando</em>`
    :a.sinal_pago
      ?`💅 ${servNome} · <em style="color:var(--greent)">Restante: ${fmtMoney(restante)}</em>`
      :`💅 ${servNome}`;
  return `<div class="aa ${a.status}">
    <div class="aa-top">
      <div class="aa-time">${fmtH(a.hora)}</div>
      <div class="aa-name">${a.cliente?.nome||'—'}</div>
      <span class="badge ${bc}" style="flex-shrink:0">${bl}</span>
    </div>
    <div class="aa-bot">
      <div class="aa-serv">${valorInfo}${a.obs?' · <em>'+a.obs+'</em>':''}</div>
      <div class="acts">
        ${reminderBtn}
        ${isPend?`<button class="btn btn-sm" style="background:var(--gold);color:#fff;font-size:.75rem;padding:6px 8px" onclick="admConfPix('${a.id}')">✓ Pix</button>`:''}
        ${a.status==='agendado'?`<button class="btn btn-sm btn-green" onclick="admConcluir('${a.id}')">✓</button>`:''}
        ${isFalt?`<button class="btn btn-sm btn-green" style="font-size:.7rem" onclick="admConcluir('${a.id}')">✓ Concluir</button>`:''}
        <button class="btn btn-sm btn-ghost" onclick="admEditAgend('${a.id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="admDelAgend('${a.id}')">🗑️</button>
      </div>
    </div>
  </div>`;
}

function admSelDay(ds){ admSelDate=ds; admRenderAgenda(); }
function admWeek(dir){ admWeekOff+=dir; admRenderAgenda(); }

async function admConcluir(id){
  await sb.from('agendamentos').update({status:'concluido'}).eq('id',id);
  toast('✅ Concluído!'); admRenderDayList(); admRenderDash();
}
async function admConfPix(id){
  if(!confirm('Confirmar recebimento do Pix e aprovar agendamento?')) return;
  const{error}=await sb.from('agendamentos').update({status:'agendado',sinal_pago:true}).eq('id',id);
  if(error){toast('Erro: '+error.message);return;}
  toast('✅ Pix confirmado! Agendamento aprovado.');
  await updateNotifCount();
  admRenderDayList(); admRenderDash();
}
async function admDelAgend(id){
  if(!confirm('Excluir agendamento?')) return;
  await sb.from('agendamentos').delete().eq('id',id);
  toast('🗑️ Excluído'); admRenderDayList(); admRenderDash();
}

async function admOpenAgend(data){
  editAgendId=null; admAgServs=[];
  await admPopSelects();
  document.getElementById('ag-data').value=data||admSelDate;
  document.getElementById('ag-hora').value='';
  document.getElementById('ag-valor').value='';
  document.getElementById('ag-status').value='agendado';
  document.getElementById('ag-obs').value='';
  document.getElementById('ag-cli').value='';
  const spChk=document.getElementById('ag-sinal-pago'); if(spChk) spChk.checked=false;
  document.getElementById('sh-agend-title').textContent='✨ Novo Agendamento';
  admRenderAgServList();
  await admRenderAgTimes();
  openSheet('sh-agend');
}
async function admEditAgend(id){
  const{data:a}=await sb.from('agendamentos').select('*').eq('id',id).single();
  if(!a) return;
  editAgendId=id;
  await admPopSelects();
  if(a.servicos_ids&&a.servicos_ids.length>0){
    admAgServs=servicos.filter(s=>a.servicos_ids.includes(s.id));
  } else if(a.servico_id){
    const s=servicos.find(x=>x.id===a.servico_id);
    admAgServs=s?[s]:[];
  } else { admAgServs=[]; }
  document.getElementById('ag-cli').value=a.cliente_id;
  document.getElementById('ag-data').value=a.data;
  document.getElementById('ag-hora').value=a.hora?.slice(0,5);
  document.getElementById('ag-valor').value=a.valor;
  document.getElementById('ag-status').value=a.status;
  document.getElementById('ag-obs').value=a.obs||'';
  const spChk=document.getElementById('ag-sinal-pago'); if(spChk) spChk.checked=!!a.sinal_pago;
  document.getElementById('sh-agend-title').textContent='✏️ Editar Agendamento';
  admRenderAgServList();
  await admRenderAgTimes();
  openSheet('sh-agend');
}
async function admPopSelects(){
  const{data:clis}=await sb.from('profiles').select('id,nome').eq('role','cliente').order('nome');
  document.getElementById('ag-cli').innerHTML='<option value="">Selecione...</option>'+(clis||[]).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
}
async function admSalvarAgend(){
  const cli=document.getElementById('ag-cli').value;
  const data=document.getElementById('ag-data').value;
  const hora=document.getElementById('ag-hora').value;
  const valor=parseFloat(document.getElementById('ag-valor').value)||0;
  const status=document.getElementById('ag-status').value;
  const obs=document.getElementById('ag-obs').value;
  if(!cli||!admAgServs.length||!data||!hora){ toast('⚠️ Preencha todos os campos'); return; }
  const sinalPago=document.getElementById('ag-sinal-pago')?.checked||false;
  const payload={
    cliente_id:cli,
    servico_id:admAgServs[0].id,
    servicos_ids:admAgServs.map(s=>s.id),
    data,hora:hora+':00',valor,status,obs,sinal_pago:sinalPago
  };
  let error;
  if(editAgendId){ ({error}=await sb.from('agendamentos').update(payload).eq('id',editAgendId)); }
  else { ({error}=await sb.from('agendamentos').insert(payload)); }
  if(error){
    if(error.message?.includes('row-level security')||error.code==='42501'){
      toast('⚠️ Permissão negada no banco. Rode o SQL de correção de RLS no Supabase.');
    } else {
      toast('Erro: '+error.message);
    }
    return;
  }
  closeSheet('sh-agend'); toast('✅ Salvo!');
  admRenderDayList(); admRenderDash();
}

function admRenderAgServList(){
  const list=servicos.filter(s=>s.ativo!==false);
  document.getElementById('ag-serv-list').innerHTML=list.map(s=>{
    const sel=admAgServs.find(x=>x.id===s.id);
    return `<div class="so ${sel?'sel':''}" onclick="admToggleAgServ('${s.id}')">
      <div class="soi">${getServIcon(s.nome)}</div>
      <div class="son">${s.nome}</div>
      <div class="sop">${fmtMoney(s.preco)}</div>
    </div>`;
  }).join('');
  const bar=document.getElementById('ag-serv-bar');
  if(!bar) return;
  if(admAgServs.length){
    const total=admAgServs.reduce((sum,x)=>sum+x.preco,0);
    const dur=admAgServs.reduce((sum,x)=>x.nome==='Decoração completa'?sum:sum+(x.duracao||60),0)||60;
    bar.style.display='block';
    bar.textContent=`${admAgServs.map(x=>x.nome).join(' + ')} · ${dur}min · ${fmtMoney(total)}`;
    document.getElementById('ag-valor').value=total;
  } else {
    bar.style.display='none';
  }
}

function admToggleAgServ(id){
  const s=servicos.find(x=>x.id===id); if(!s) return;
  const idx=admAgServs.findIndex(x=>x.id===id);
  if(idx>=0) admAgServs.splice(idx,1); else admAgServs.push(s);
  admRenderAgServList();
  admRenderAgTimes();
}

async function admRenderAgTimes(){
  const data=document.getElementById('ag-data').value;
  const el=document.getElementById('ag-times');
  if(!el) return;
  if(!data){ el.innerHTML='<div style="font-size:.8rem;color:var(--t3);padding:4px 0">Selecione uma data primeiro</div>'; return; }
  const horarios=getHorariosData(data);
  if(!horarios.length){ el.innerHTML='<div style="font-size:.8rem;color:var(--t3);padding:4px 0">Dia sem atendimento configurado</div>'; return; }
  const dur=admAgServs.reduce((sum,x)=>x.nome==='Decoração completa'?sum:sum+(x.duracao||60),0)||60;
  const slots=Math.ceil(dur/60);
  const{data:ocp}=await sb.from('agendamentos')
    .select('id,hora,servico:servicos(duracao)')
    .eq('data',data).neq('status','cancelado');
  const takenH=new Set();
  (ocp||[]).forEach(a=>{
    if(a.id===editAgendId) return;
    const d=a.servico?.duracao||60;
    const sh=Math.ceil(d/60);
    const hh=parseInt(a.hora.split(':')[0]);
    for(let i=0;i<sh;i++) takenH.add(hh+i);
  });
  const curHora=document.getElementById('ag-hora').value;
  el.innerHTML=horarios.map(h=>{
    const hh=parseInt(h.split(':')[0]);
    let blocked=false;
    for(let i=0;i<slots;i++){ if(takenH.has(hh+i)){blocked=true;break;} }
    const sel=curHora===h;
    return `<div class="tb ${sel?'sel':''} ${blocked&&!sel?'taken':''}" onclick="${blocked&&!sel?'':'admSelAgHora(\''+h+'\')'}">
      ${blocked&&!sel?`<span style="font-size:.9rem">🚫</span><br>${h}`:h}</div>`;
  }).join('');
}

function admSelAgHora(h){
  document.getElementById('ag-hora').value=h;
  admRenderAgTimes();
}

async function admRenderClis(){
  const q=(document.getElementById('adm-cli-busca')?.value||'').toLowerCase();
  const{data:clis}=await sb.from('profiles').select('*').eq('role','cliente').order('nome');
  const{data:ags}=await sb.from('agendamentos').select('cliente_id,status');
  const conc={}; (ags||[]).forEach(a=>{ if(a.status==='concluido') conc[a.cliente_id]=(conc[a.cliente_id]||0)+1; });
  const list=(clis||[]).filter(c=>c.nome?.toLowerCase().includes(q)||c.email?.toLowerCase().includes(q));
  document.getElementById('adm-cli-count').textContent=`${list.length} cliente${list.length!==1?'s':''}`;
  const el=document.getElementById('adm-cli-list');
  if(!list.length){ el.innerHTML='<div class="empty"><div class="ei">👩</div><p>Nenhuma cliente</p></div>'; return; }
  el.innerHTML=list.map(c=>{
    const wa=c.tel?.replace(/\D/g,'');
    const total=conc[c.id]||0;
    const ciclo=total%5;
    const ganhos=Math.floor(total/5);
    const disponiveis=Math.max(0,ganhos-(c.premios_resgatados||0));
    const stampsDone=ciclo===0&&total>0?5:ciclo;
    return `<div class="ci" style="cursor:pointer" onclick="admOpenCli('${c.id}')">
      <div class="ci-av">👩</div>
      <div class="ci-info">
        <div class="cn">${c.nome||'—'}</div>
        <div class="cm">${c.email||'—'}</div>
        ${c.tel?`<div class="cm" style="margin-top:2px">📱 ${c.tel}</div>`:'<div class="cm" style="color:var(--red)">⚠️ Sem telefone</div>'}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center" onclick="event.stopPropagation()">
        ${c.tel?`<a href="https://wa.me/55${wa}" target="_blank" class="btn btn-sm btn-wa" style="text-decoration:none">📲</a>`:''}
        <div style="text-align:center">
          <span class="badge ${disponiveis>0?'badge-gold':'badge-nude'}">${total===0?'0x':`${stampsDone}/5`}</span>
          ${disponiveis>0?`<div style="font-size:.58rem;color:var(--goldt);font-weight:800;margin-top:1px">🎁 ${disponiveis>1?disponiveis+'x ':''}Prêmio!</div>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function admOpenCli(id){
  const modal=document.getElementById('modal-cli');
  const body=document.getElementById('modal-cli-body');
  body.innerHTML='<div style="text-align:center;padding:32px;color:var(--t3)">Carregando...</div>';
  openModal('modal-cli');

  const[{data:cli},{data:ags}]=await Promise.all([
    sb.from('profiles').select('*').eq('id',id).single(),
    sb.from('agendamentos')
      .select('*,servico:servicos(nome,preco)')
      .eq('cliente_id',id)
      .order('data',{ascending:false}).order('hora',{ascending:false})
      .limit(30)
  ]);
  if(!cli){body.innerHTML='<p>Erro ao carregar.</p>';return;}

  const concluidos=(ags||[]).filter(a=>a.status==='concluido');
  const total=concluidos.length;
  const ciclo=total%5;
  const ganhos=Math.floor(total/5);
  const resgatados=cli.premios_resgatados||0;
  const disponiveis=Math.max(0,ganhos-resgatados);
  const stampsDone=ciclo===0&&total>0?5:ciclo;

  const stampsHtml=Array.from({length:5},(_,i)=>
    `<div class="fid-stamp ${i<stampsDone?'done':''}">${i<stampsDone?'💅':''}</div>`
  ).join('');

  const histHtml=(ags||[]).slice(0,8).map(a=>{
    const stMap={concluido:'✅',cancelado:'❌',agendado:'🗓️',pendente:'⏳',faltante:'👻'};
    const stLbl={concluido:'Concluído',cancelado:'Cancelado',agendado:'Agendado',pendente:'Pendente',faltante:'Faltou'};
    return `<div class="cli-hist-item">
      <span style="font-size:1.1rem">${stMap[a.status]||'•'}</span>
      <div style="flex:1">
        <div style="font-size:.82rem;font-weight:700">${a.servico?.nome||'—'}</div>
        <div style="font-size:.74rem;color:var(--t2)">${fmtDate(a.data)} · ${fmtH(a.hora)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.8rem;font-weight:800;color:var(--pdk)">${fmtMoney(a.servico?.preco)}</div>
        <div style="font-size:.68rem;color:var(--t3)">${stLbl[a.status]||a.status}</div>
      </div>
    </div>`;
  }).join('');

  const wa=cli.tel?.replace(/\D/g,'');
  const nomeEsc=(cli.nome||'').replace(/'/g,"\\'");
  body.innerHTML=`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div style="width:56px;height:56px;border-radius:50%;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0">👩</div>
      <div>
        <div style="font-size:1.05rem;font-weight:900">${cli.nome||'—'}</div>
        <div style="font-size:.78rem;color:var(--t2)">${cli.email||'—'}</div>
        ${cli.tel?`<div style="font-size:.78rem;color:var(--t2)">📱 ${cli.tel}</div>`:''}
      </div>
      ${wa?`<a href="https://wa.me/55${wa}" target="_blank" class="btn btn-sm btn-wa" style="text-decoration:none;margin-left:auto">📲</a>`:''}
    </div>

    <div class="fid-card">
      <div class="fid-title">Cartão Fidelidade · Fiuza Nails</div>
      <div class="fid-subtitle">💅 Ganhe 1 Decoração a cada 5 atendimentos</div>
      <div class="fid-stamps">${stampsHtml}</div>
      <div style="margin:8px 0 ${disponiveis>0||ganhos>0?'10':'4'}px;display:flex;gap:10px;flex-wrap:wrap">
        <span style="font-size:.73rem;opacity:.7">${stampsDone}/5 no ciclo atual</span>
        ${ganhos>0?`<span style="font-size:.73rem;font-weight:800;color:var(--gold)">🏆 ${ganhos} ganho${ganhos>1?'s':''}</span>`:''}
        ${resgatados>0?`<span style="font-size:.73rem;opacity:.6">✅ ${resgatados} resgatado${resgatados>1?'s':''}</span>`:''}
        ${disponiveis>0?`<span style="font-size:.73rem;font-weight:900;color:#FFD700">🎁 ${disponiveis} disponíve${disponiveis>1?'is':'l'}</span>`:''}
      </div>
      ${disponiveis>0?`
      <div style="display:flex;gap:8px;align-items:center">
        <div class="fid-prize clickable" style="flex:1;min-width:0" onclick="admEnviarPremioFid('${nomeEsc}','${cli.tel||''}')" title="Avisar cliente pelo WhatsApp">
          🎁 ${disponiveis} Decoraç${disponiveis>1?'ões':'ão'} disponíve${disponiveis>1?'is':'l'}
          <span style="margin-left:auto;font-size:.7rem;background:rgba(0,0,0,.15);padding:2px 7px;border-radius:7px;white-space:nowrap;flex-shrink:0">📲 Avisar</span>
        </div>
        <button onclick="admRegatarPremio('${cli.id}','${nomeEsc}',${resgatados})" style="flex-shrink:0;background:rgba(255,255,255,.22);border:2px solid rgba(255,255,255,.3);border-radius:12px;padding:11px 16px;cursor:pointer;font-size:.78rem;font-weight:800;color:#3a1800;white-space:nowrap;line-height:1">
          ✅ Marcar resgatado
        </button>
      </div>`
      :ganhos>0?`<div style="font-size:.75rem;color:rgba(255,255,255,.5);margin-top:4px">Todos os ${ganhos} prêmio${ganhos>1?'s':''} já foram resgatados ✓</div>`:''}
    </div>

    <div style="font-size:.78rem;font-weight:800;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Histórico recente</div>
    <div>${histHtml||'<div class="empty"><div class="ei">📋</div><p>Sem agendamentos</p></div>'}</div>
    <div style="height:12px"></div>
  `;
}

async function admRegatarPremio(cliId, cliNome, resgatadosAtual){
  if(!confirm(`Marcar 1 prêmio de ${cliNome} como resgatado?`)) return;
  const{error}=await sb.from('profiles').update({premios_resgatados:resgatadosAtual+1}).eq('id',cliId);
  if(error){toast('Erro: '+error.message);return;}
  toast(`✅ Prêmio de ${cliNome.split(' ')[0]} registrado como resgatado!`);
  admOpenCli(cliId);
}

function admEnviarPremioFid(cliNome, cliTel){
  const tel=(cliTel||'').replace(/\D/g,'');
  if(!tel){toast('⚠️ Cliente sem telefone cadastrado');return;}
  const nome=cliNome?.split(' ')[0]||'você';
  const msg=encodeURIComponent(
    `🎉 Parabéns, ${nome}!\n\n`+
    `Você completou *5 atendimentos* na Fiuza Nails e ganhou uma *Decoração gratuita*! 💅✨\n\n`+
    `🎁 Entre em contato para agendar o seu prêmio!\n\n`+
    `_Fiuza Nails — Nail Designer_`
  );
  window.open(`https://wa.me/55${tel}?text=${msg}`,'_blank');
  toast(`📲 WhatsApp aberto para ${nome}!`);
}

// ── NO-SHOW: marca faltante automaticamente após horário expirar ──
async function checkNoShows(){
  const now=new Date();
  const today=todayStr();
  const yesterday=new Date(now); yesterday.setDate(yesterday.getDate()-1);
  const yStr=yesterday.toISOString().split('T')[0];

  const{data}=await sb.from('agendamentos')
    .select('id,hora,data,servico:servicos(duracao)')
    .in('status',['agendado','pendente'])
    .gte('data',yStr).lte('data',today);

  const vencidos=(data||[]).filter(a=>{
    const dur=(a.servico?.duracao||60);
    const[hh,mm]=(a.hora||'00:00').split(':').map(Number);
    const end=new Date(a.data+'T00:00:00');
    end.setHours(hh,mm+dur,0,0);
    return end<now;
  });

  if(!vencidos.length) return;
  const ids=vencidos.map(a=>a.id);
  await sb.from('agendamentos').update({status:'faltante'}).in('id',ids);
  toast(`👻 ${ids.length} atendimento${ids.length>1?'s':''} marcado${ids.length>1?'s':''} como faltante`);
  admRenderDayList();
  admRenderDash();
  await updateNotifCount();
}

function admRenderServs(){
  const el=document.getElementById('adm-serv-list');
  const lista=servicosAll.length?servicosAll:servicos;
  if(!lista.length){ el.innerHTML='<div class="empty"><div class="ei">✨</div><p>Nenhum serviço</p></div>'; return; }
  el.innerHTML=lista.map(s=>{
    const inativo=s.ativo===false;
    return `<div class="si2" style="opacity:${inativo?.5:1}">
      <div class="si2-ic">${getServIcon(s.nome)}</div>
      <div class="si2-info">
        <div class="sn">${s.nome}${inativo?` <span style="font-size:.65rem;background:var(--s3);color:var(--t3);padding:2px 6px;border-radius:6px;font-weight:800">INATIVO</span>`:''}</div>
        <div class="si2-bot">
          <div class="sm">${s.duracao?s.duracao+' min':''}${s.descricao?' · '+s.descricao:''}</div>
          <div class="si2-p">${fmtMoney(s.preco)}</div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-sm btn-ghost" onclick="admEditServ('${s.id}',true)">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="admDelServ('${s.id}')">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}
function admOpenServ(){ editServId=null; ['sv-nome','sv-desc'].forEach(id=>document.getElementById(id).value=''); ['sv-preco','sv-dur'].forEach(id=>document.getElementById(id).value=''); const chk=document.getElementById('sv-ativo'); if(chk) chk.checked=true; const ic=document.getElementById('sv-icone'); if(ic) ic.value=''; admRenderIconePicks(); document.getElementById('sh-serv-title').textContent='✨ Novo Serviço'; openSheet('sh-serv'); }
function admEditServ(id,all=false){ const lista=all?servicosAll:servicos; const s=lista.find(x=>x.id===id)||servicos.find(x=>x.id===id); if(!s) return; editServId=id; document.getElementById('sv-nome').value=s.nome; document.getElementById('sv-preco').value=s.preco; document.getElementById('sv-dur').value=s.duracao||''; document.getElementById('sv-desc').value=s.descricao||''; const chk=document.getElementById('sv-ativo'); if(chk) chk.checked=s.ativo!==false; const ic=document.getElementById('sv-icone'); if(ic) ic.value=s.icone||''; admRenderIconePicks(); document.getElementById('sh-serv-title').textContent='✏️ Editar Serviço'; openSheet('sh-serv'); }
async function admSalvarServ(){ const nome=document.getElementById('sv-nome').value.trim(); const preco=parseFloat(document.getElementById('sv-preco').value)||0; const dur=parseInt(document.getElementById('sv-dur').value)||0; const desc=document.getElementById('sv-desc').value.trim(); const ativo=document.getElementById('sv-ativo')?.checked!==false; const icone=document.getElementById('sv-icone')?.value.trim()||null; if(!nome){ toast('Nome é obrigatório'); return; } const payload={nome,preco,duracao:dur,descricao:desc,ativo,icone}; let error; if(editServId){ ({error}=await sb.from('servicos').update(payload).eq('id',editServId)); } else { ({error}=await sb.from('servicos').insert(payload)); } if(error){ toast('Erro: '+error.message); return; } await fetchServs(); await admFetchServicosAll(); closeSheet('sh-serv'); toast('✅ Serviço salvo!'); admRenderServs(); }
async function admDelServ(id){
  if(!confirm('Excluir serviço?')) return;
  const{error}=await sb.from('servicos').delete().eq('id',id);
  if(error){
    // FK constraint: tem agendamentos vinculados — desativa em vez de deletar
    await sb.from('servicos').update({ativo:false}).eq('id',id);
    toast('⚠️ Serviço desativado (tem agendamentos vinculados)');
  } else {
    toast('🗑️ Removido');
  }
  await fetchServs(); await admFetchServicosAll(); admRenderServs();
}

// ── FINANCEIRO ──
async function finTab(periodo, el){
  finPeriodo=periodo;
  document.querySelectorAll('.fin-tab').forEach(t=>t.classList.remove('active'));
  el?.classList.add('active');
  if(periodo==='data'){ show('fin-date-wrap'); } else { hide('fin-date-wrap'); }
  const now=new Date(), today=todayStr(), mes=now.getMonth(), ano=now.getFullYear();
  const dow=now.getDay();
  const monDt=new Date(now); monDt.setDate(now.getDate()-dow+(dow===0?-6:1));
  const sunDt=new Date(monDt); sunDt.setDate(monDt.getDate()+6);
  let from='', to='';
  if(periodo==='hoje'){ from=today; to=today; }
  else if(periodo==='semana'){ from=monDt.toISOString().split('T')[0]; to=sunDt.toISOString().split('T')[0]; }
  else if(periodo==='mes'){ from=`${ano}-${String(mes+1).padStart(2,'0')}-01`; const lastDay=new Date(ano,mes+1,0).getDate(); to=`${ano}-${String(mes+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`; }
  else if(periodo==='data'){
    const f=document.getElementById('fin-date-from').value;
    const t=document.getElementById('fin-date-to').value;
    if(!f||!t){ document.getElementById('fin-val').textContent='—'; document.getElementById('fin-sub').textContent='Escolha o período acima'; document.getElementById('fin-list').innerHTML=''; return; }
    from=f; to=t;
  }
  let q=sb.from('agendamentos').select('*,servico:servicos(nome),cliente:profiles(nome)').eq('status','concluido').order('data',{ascending:false}).order('hora',{ascending:false});
  q=q.gte('data',from).lte('data',to);
  const{data}=await q;
  const total=(data||[]).reduce((s,a)=>s+Number(a.valor||0),0);
  document.getElementById('fin-val').textContent=fmtMoney(total);
  document.getElementById('fin-sub').textContent=`${(data||[]).length} atendimentos concluídos`;
  document.getElementById('fin-list').innerHTML=(data||[]).map(a=>`
    <div class="fin-row">
      <div><div class="fn">${a.cliente?.nome||'—'}</div><div class="fd">${fmtDate(a.data)} · ${fmtH(a.hora)} · ${a.servico?.nome||'—'}</div></div>
      <div class="fval">${fmtMoney(a.valor)}</div>
    </div>`).join('')||'<div style="text-align:center;color:var(--t2);padding:20px;font-size:.84rem">Sem registros no período</div>';
}

// Close sheets on backdrop
document.querySelectorAll('.sheet-overlay').forEach(o=>{
  o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('open'); });
});

// ── PWA Install Banner ──
(function(){
  const DISMISS_KEY='pwa_banner_dismissed';
  const isStandalone=window.matchMedia('(display-mode:standalone)').matches||navigator.standalone===true;
  if(isStandalone) return;
  if(sessionStorage.getItem(DISMISS_KEY)) return;

  const banner=document.getElementById('pwa-banner');
  const btn=document.getElementById('pwa-banner-btn');
  const sub=document.getElementById('pwa-banner-sub');
  let deferredPrompt=null;

  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    deferredPrompt=e;
    sub.textContent='Instale e acesse como um app';
    banner.classList.remove('hidden');
  });

  if(isIOS&&!isStandalone){
    sub.textContent='Veja como adicionar à tela inicial';
    btn.textContent='Como instalar';
    setTimeout(()=>banner.classList.remove('hidden'),2000);
  }

  btn.addEventListener('click',async()=>{
    if(deferredPrompt){
      deferredPrompt.prompt();
      const{outcome}=await deferredPrompt.userChoice;
      deferredPrompt=null;
      if(outcome==='accepted') banner.classList.add('hidden');
    } else if(isIOS){
      const m=document.getElementById('pwa-ios-modal');
      m.classList.remove('hidden');
      m.style.display='flex';
    }
  });
})();

function pwaBannerDismiss(){
  document.getElementById('pwa-banner').classList.add('hidden');
  sessionStorage.setItem('pwa_banner_dismissed','1');
}

init();
