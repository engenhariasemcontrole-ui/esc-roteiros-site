import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const $=id=>document.getElementById(id);
const RICH_HEADER='ESC_RICH_V1\n';
const swatches={yellow:'#fde58a',red:'#f9b0b8',blue:'#a9d5ff',green:'#b7e8bb',pink:'#f2b7df'};
const safeColors=new Map();
for(const hex of Object.values(swatches)){const t=document.createElement('span');t.style.backgroundColor=hex;safeColors.set(t.style.backgroundColor.toLowerCase(),hex);safeColors.set(hex,hex)}
function sanitizeMarkup(input){
 const doc=new DOMParser().parseFromString('<div>'+input+'</div>','text/html'),out=document.createElement('div');
 function recur(src,dst){for(const n of src.childNodes){if(n.nodeType===3){dst.appendChild(document.createTextNode(n.textContent));continue}if(n.nodeType!==1)continue;const tag=n.tagName.toLowerCase();if(['script','style','svg','iframe','object','template'].includes(tag))continue;const el=document.createElement(['b','strong','br','div','p','span'].includes(tag)?tag:'span');if(tag==='span'&&safeColors.has(n.style.backgroundColor.toLowerCase()))el.style.backgroundColor=safeColors.get(n.style.backgroundColor.toLowerCase());if(tag!=='br')recur(n,el);dst.appendChild(el)}}recur(doc.body.firstElementChild,out);return out.innerHTML
}
function plainEditor(){return $('script-body').innerText.replace(/\r/g,'').replace(/\n$/,'')}
function readEditor(){const html=sanitizeMarkup($('script-body').innerHTML);const temp=document.createElement('div');temp.innerHTML=html;return temp.querySelector('b,strong,span[style*="background-color"]')?RICH_HEADER+html:plainEditor()}
function writeEditor(v){$('script-body').innerHTML=String(v||'').startsWith(RICH_HEADER)?sanitizeMarkup(v.slice(RICH_HEADER.length)):'';if(!String(v||'').startsWith(RICH_HEADER))$('script-body').textContent=v||'';resizePaper()}
function selectedText(){const s=window.getSelection();return !!(s&&s.rangeCount&&!s.isCollapsed&&$('script-body').contains(s.anchorNode)&&$('script-body').contains(s.focusNode))}
let selectionCopy=null;
function trackSelection(){if(selectedText())selectionCopy=window.getSelection().getRangeAt(0).cloneRange()}
function applyFormat(command,value){if(!selectedText()){if(!selectionCopy)return toast('Selecione um trecho do roteiro.',true);try{const s=window.getSelection();s.removeAllRanges();s.addRange(selectionCopy)}catch{return toast('Selecione novamente o trecho.',true)}}if(!selectedText())return toast('Selecione um trecho do roteiro.',true);$('script-body').focus();document.execCommand('styleWithCSS',false,command==='hiliteColor'?'true':'false');document.execCommand(command,false,value||null);selectionCopy=null;dirty=true;countWords();resizePaper();scheduleOutline()}
$('bold-selection').addEventListener('pointerdown',e=>e.preventDefault());
$('bold-selection').onclick=()=>applyFormat('bold');
$('highlight-toggle').addEventListener('pointerdown',e=>e.preventDefault());
$('highlight-toggle').onclick=()=>{trackSelection();$('highlight-palette').classList.toggle('hidden')};
document.querySelectorAll('[data-color]').forEach(btn=>{btn.addEventListener('pointerdown',e=>e.preventDefault());btn.onclick=()=>{applyFormat('hiliteColor',swatches[btn.dataset.color]||'#f2e8d5');$('highlight-palette').classList.add('hidden')}});
$('script-body').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b'){e.preventDefault();document.execCommand('styleWithCSS',false,'false');document.execCommand('bold');dirty=true;countWords();resizePaper();scheduleOutline()}});
$('script-body').addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))});
document.addEventListener('selectionchange',trackSelection);
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.highlighter'))$('highlight-palette').classList.add('hidden')});

let db=null,user=null,scripts=[],versions=[],selected=null,selectedVersion=null,dirty=false;
const show=(id)=>['setup','login','workspace'].forEach(x=>$(x).classList.toggle('hidden',x!==id));
const toast=(message,isError=false)=>{const t=$('toast');t.textContent=message;t.className=isError?'error':'ok';setTimeout(()=>t.className='',4500)};
const err=e=>toast(e?.message||String(e),true);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function config(){try{return JSON.parse(localStorage.getItem('esc-config')||'null')}catch{return null}}
async function start(){const c=config();if(!c){show('setup');return}try{db=createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}); const {data,error}=await db.auth.getUser();if(error&& !/session missing/i.test(error.message))throw error;user=data?.user||null;if(user)await load();else show('login')}catch(e){err(e);show('login')}}
$('save-config').onclick=async()=>{const url=$('project-url').value.trim().replace(/\/$/,'');const key=$('anon-key').value.trim();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key){toast('Informe uma URL de projeto Supabase válida e a chave publishable/anon.',true);return}if(key.startsWith('sb_secret_')){toast('Não utilize uma chave secreta!',true);return}localStorage.setItem('esc-config',JSON.stringify({url,key}));await start()};
$('change-config').onclick=()=>{if(confirm('Alterar a configuração do Supabase neste navegador?')){localStorage.removeItem('esc-config');location.reload()}};
$('login-button').onclick=async()=>{const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)return err(error);user=data.user;await load()};
$('signup-button').onclick=async()=>{const {error}=await db.auth.signUp({email:$('email').value.trim(),password:$('password').value});if(error)return err(error);toast('Cadastro solicitado. Se a confirmação por e-mail estiver ativa, confira sua caixa de entrada.')};
$('reset-button').onclick=async()=>{const email=$('email').value.trim();if(!email)return toast('Digite o e-mail primeiro.',true);const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)return err(error);toast('Se o e-mail estiver cadastrado, receberá instruções de recuperação.')};
$('signout').onclick=async()=>{await db.auth.signOut();user=null;selected=null;$('signout').classList.add('hidden');$('account').textContent='';show('login')};
async function load(){show('workspace');$('account').textContent=user.email||'';$('signout').classList.remove('hidden');await refreshScripts()}
async function refreshScripts(){const {data,error}=await db.from('roteiros').select('id,titulo,status,descricao,created_at,updated_at').order('updated_at',{ascending:false});if(error)return err(error);scripts=data||[];renderScripts();if(selected){const s=scripts.find(s=>s.id===selected.id);if(s)await selectScript(s.id);else{selected=null;$('editor-view').classList.add('hidden');$('empty').classList.remove('hidden')}}}
function renderScripts(){const filter=$('search').value.trim().toLowerCase();const items=scripts.filter(s=>s.titulo.toLowerCase().includes(filter));$('scripts-list').innerHTML=items.length?items.map(s=>`<button class="script-row ${selected?.id===s.id?'selected':''}" data-id="${s.id}"><strong>${escapeHtml(s.titulo)}</strong><small>${escapeHtml(s.status)}</small></button>`).join(''):'<p class="muted">Nenhum roteiro encontrado.</p>';document.querySelectorAll('.script-row').forEach(b=>b.onclick=()=>selectScript(b.dataset.id))}
$('search').oninput=renderScripts;
$('new-script').onclick=async()=>{const titulo=prompt('Qual é o título do novo roteiro?');if(!titulo?.trim())return;const {data,error}=await db.from('roteiros').insert({titulo:titulo.trim(),owner_id:user.id}).select('id').single();if(error)return err(error);selected=null;await refreshScripts();await selectScript(data.id);toast('Roteiro criado. Escreva e salve a V1.')};
async function selectScript(id){if(dirty && selected?.id!==id && !confirm('Há alterações no editor que ainda não foram salvas como versão. Descartar?'))return;const s=scripts.find(s=>s.id===id);if(!s)return;selected=s;dirty=false;$('empty').classList.add('hidden');$('editor-view').classList.remove('hidden');$('script-title').value=s.titulo;$('script-status').value=s.status;$('script-date').textContent='Atualizado em '+new Date(s.updated_at).toLocaleDateString('pt-BR');const {data,error}=await db.from('versoes').select('id,numero,conteudo,notas,created_at').eq('roteiro_id',id).order('numero',{ascending:false});if(error)return err(error);versions=data||[];const select=$('version-select');select.innerHTML=versions.length?versions.map(v=>`<option value="${v.id}">V${v.numero}</option>`).join(''):'<option value="">Nenhuma versão</option>';loadVersion(versions[0]?.id||null);renderScripts()}
function loadVersion(id){selectedVersion=versions.find(v=>v.id===id)||null;$('version-select').value=id||'';writeEditor(selectedVersion?.conteudo||'');$('version-info').textContent=selectedVersion?`V${selectedVersion.numero} • ${new Date(selectedVersion.created_at).toLocaleString('pt-BR')}`:'Comece escrevendo a primeira versão.';dirty=false;countWords();resizePaper();refreshOutline()}
$('version-select').onchange=e=>{if(dirty&&!confirm('Descartar alterações ainda não salvas?')){e.target.value=selectedVersion?.id||'';return}loadVersion(e.target.value)};
function resizePaper(){const paper=$('script-body');paper.style.height='auto';paper.style.height=Math.max(650,paper.scrollHeight+4)+'px'}
function countWords(){const words=plainEditor().trim().split(/\s+/).filter(Boolean).length;$('word-count').textContent=`(${words} palavras · ~${Math.max(1,Math.round(words/135))} min)`}
$('script-body').oninput=()=>{dirty=true;countWords();resizePaper();scheduleOutline()};
$('save-meta').onclick=async()=>{if(!selected)return;const titulo=$('script-title').value.trim();if(!titulo)return toast('Informe o título.',true);const {error}=await db.from('roteiros').update({titulo,status:$('script-status').value}).eq('id',selected.id);if(error)return err(error);await refreshScripts();toast('Dados atualizados.')};
$('save-version').onclick=async()=>{if(!selectedVersion)return toast('Salve primeiro a V1 com o botão Nova versão.',true);const content=readEditor();if(!content.trim())return toast('Digite o roteiro antes de salvar.',true);const original=selectedVersion.conteudo;if(original===content){toast('Nenhuma alteração no texto.');return;}if(!confirm(`Atualizar o texto da V${selectedVersion.numero}? O conteúdo anterior desta mesma versão será substituído.`))return;const {data,error}=await db.from('versoes').update({conteudo:content}).eq('id',selectedVersion.id).eq('roteiro_id',selected.id).select('id,conteudo').single();if(error)return err(error);if(!data)return toast('Não foi possível confirmar a atualização.',true);selectedVersion.conteudo=data.conteudo;dirty=false;toast(`V${selectedVersion.numero} atualizada no Supabase.`)};
$('create-version').onclick=async()=>{if(!selected)return;const content=readEditor();if(!content.trim())return toast('Digite o roteiro antes de salvar.',true);const next=versions.length?Math.max(...versions.map(v=>v.numero))+1:1;if(!confirm(`Salvar texto atual como V${next}? A versão anterior será preservada.`))return;const {error}=await db.from('versoes').insert({roteiro_id:selected.id,owner_id:user.id,numero:next,conteudo:content,notas:''});if(error)return err(error);dirty=false;await refreshScripts();toast(`V${next} salva no Supabase.`)};
$('copy-version').onclick=async()=>{try{await navigator.clipboard.writeText(plainEditor());toast('Texto copiado.')}catch{toast('Não foi possível copiar automaticamente.',true)}};
$('download-version').onclick=()=>{if(!selected)return;const blob=new Blob([plainEditor()],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${selected.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-_]+/g,'-').slice(0,70)}-V${selectedVersion?.numero||'rascunho'}.txt`;a.click();URL.revokeObjectURL(url)};
$('delete-script').onclick=async()=>{if(!selected)return;if(!confirm(`EXCLUIR PERMANENTEMENTE "${selected.titulo}" e todas as versões? Esta ação não pode ser desfeita.`))return;const {error}=await db.from('roteiros').delete().eq('id',selected.id);if(error)return err(error);selected=null;$('editor-view').classList.add('hidden');$('empty').classList.remove('hidden');await refreshScripts();toast('Roteiro excluído.')};
const workspace=$('workspace'),readingArea=$('reading-area');

/* Extract chapter headings from the existing contenteditable DOM, without modifying the script. */
let outlineMode=false,outlineEntries=[],outlineTimer=null;
function isChapterHeading(line){
 const s=line.trim().replace(/^\*\*(.*?)\*\*$/, '$1').trim();
 if(!s||s.length>110)return null;
 const marker=/^(?:\s*#{1,6}\s*|\s*\*{1,3}\s+|\s*\d{1,2}(?:\.\d{1,2}){0,2}[.):-]\s*|\s*cap[ií]tulo\s*(?:\d{1,2}|[ivx]+)\b[\s.:-]*)/i;
 const named=/^(?:introdu[çc][aã]o|conclus[aã]o|encerramento|considera[çc][õo]es finais|abertura)(?:\s*[—–:.-]\s*.*)?$/i;
 const found=s.match(marker);
 if(found){const label=s.replace(marker,'').trim();return label?s:null}
 return named.test(s)?s:null;
}
function linesWithAnchors(){
 const editor=$('script-body'),lines=[],walker=document.createTreeWalker(editor,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT),blocks=new Set(['DIV','P','H1','H2','H3','H4','H5','H6','LI']);
 let line='',anchor=null,node;
 function finish(){if(line.trim())lines.push({label:line.trim(),anchor});line='';anchor=null}
 function addText(text,n){for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='\n'){finish();continue}if(!anchor&&!/\s/.test(ch))anchor={node:n,offset:i};line+=ch}}
 while((node=walker.nextNode())){
  if(node.nodeType===Node.TEXT_NODE){addText(node.textContent,node);continue}
  if(node.nodeType===Node.ELEMENT_NODE){
   if(node.tagName==='BR'){finish();continue}
   if(blocks.has(node.tagName)&&line.trim())finish();
  }
 }
 finish();return lines;
}
function refreshOutline(){
 const next=[];for(const item of linesWithAnchors()){const title=isChapterHeading(item.label);if(title&&item.anchor)next.push({title,anchor:item.anchor})}
 outlineEntries=next;
 $('outline-count').textContent=next.length?next.length+' capítulos':'';
 const list=$('outline-list');list.replaceChildren();
 if(!next.length){const p=document.createElement('p');p.className='muted tiny';p.textContent='Nenhum capítulo identificado. Use títulos como # Introdução, 01. Batentes ou CAPÍTULO 2.';list.append(p);return}
 next.forEach((entry,i)=>{const btn=document.createElement('button');btn.type='button';btn.className='outline-item';const number=document.createElement('span');number.className='outline-num';number.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span');label.textContent=entry.title;btn.append(number,label);btn.onclick=()=>jumpToChapter(i);list.append(btn)});
}
function scheduleOutline(){clearTimeout(outlineTimer);outlineTimer=setTimeout(refreshOutline,180)}
function jumpToChapter(index){
 const a=outlineEntries[index]?.anchor;if(!a)return;
 try{
  const range=document.createRange();range.setStart(a.node,Math.min(a.offset,a.node.textContent.length));range.setEnd(a.node,Math.min(a.offset+1,a.node.textContent.length));
  const target=range.getBoundingClientRect(),view=$('reading-area').getBoundingClientRect();
  if(!target.height&&!target.width)return;
  $('reading-area').scrollTo({top:Math.max(0,$('reading-area').scrollTop+target.top-view.top-72),behavior:'smooth'});
 }catch{refreshOutline()}
}
function setOutlineMode(on){
 outlineMode=on;
 $('sidebar-scripts').classList.toggle('hidden',on);
 $('sidebar-outline').classList.toggle('hidden',!on);
 $('outline-toggle').setAttribute('aria-expanded',String(on));
 $('outline-toggle').textContent=on?'☷ Voltar aos roteiros':'☷ Sumário';
 if(on){
  if(workspace.classList.contains('focus-mode')){$('toggle-focus').click()}
  sidebarCollapsed=false;localStorage.setItem('esc-sidebar-collapsed','0');applySidebar();
  refreshOutline();$('scripts-sidebar').scrollTop=0;
 }else $('scripts-sidebar').scrollTop=0;
}
$('outline-toggle').onclick=()=>setOutlineMode(!outlineMode);
$('outline-back').onclick=()=>setOutlineMode(false);

let sidebarCollapsed=localStorage.getItem('esc-sidebar-collapsed')==='1';
function applySidebar(){workspace.classList.toggle('sidebar-collapsed',sidebarCollapsed);$('toggle-sidebar').textContent=sidebarCollapsed?'☰ Mostrar roteiros':'☰ Recolher roteiros';$('toggle-sidebar').setAttribute('aria-expanded',String(!sidebarCollapsed));}
$('toggle-sidebar').onclick=()=>{sidebarCollapsed=!sidebarCollapsed;localStorage.setItem('esc-sidebar-collapsed',sidebarCollapsed?'1':'0');applySidebar();resizePaper()};
$('toggle-focus').onclick=()=>{const on=workspace.classList.toggle('focus-mode');$('toggle-focus').textContent=on?'↩ Sair do foco':'⛶ Foco na leitura';resizePaper();};
readingArea.addEventListener('scroll',()=>{const down=readingArea.scrollTop>125;document.body.classList.toggle('reading-scrolled',down);$('reader-top').classList.toggle('hidden',!down)});
$('reader-top').onclick=()=>readingArea.scrollTo({top:0,behavior:'smooth'});
window.addEventListener('resize',resizePaper);
applySidebar();
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
start();
