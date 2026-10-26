(() => {
  const projectUrl = 'https://SEU-PROJETO.supabase.co';
  const publicKey = 'COLE_SUA_CHAVE_PUBLICAVEL_AQUI';
  const configured = window.supabase && !projectUrl.includes('SEU-PROJETO') && publicKey.length > 20 && !publicKey.includes('COLE_');
  const db = configured ? window.supabase.createClient(projectUrl, publicKey) : null;
  const app = window.PostagensState;
  const $ = id => document.getElementById(id);
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shareCode = new URLSearchParams(location.search).get('mural');
  let signedInUser = null, teacherChannel = null, studentChannel = null;

  function postFromRow(row) {
    const image = row.image_path ? db.storage.from('post-images').getPublicUrl(row.image_path).data.publicUrl : '';
    return {id:row.id,name:row.author_name,title:row.title,description:row.description||'',text:row.body||'',image,image_path:row.image_path||'',createdAt:new Date(row.created_at).getTime()};
  }
  async function upload(code, file) {
    if (!file) return null;
    if (!file.type.startsWith('image/') || file.size > 3*1024*1024) throw new Error('Escolha uma imagem ou GIF de até 3 MB.');
    const name=String(file.name||'imagem').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${code}/${crypto.randomUUID()}-${name}`;
    const {error}=await db.storage.from('post-images').upload(path,file,{upsert:false,contentType:file.type});
    if(error)throw error;
    return path;
  }
  async function loadPosts(b) {
    const {data,error}=await db.rpc('list_shared_posts',{p_share_code:b.share_code});
    if(error)throw error;
    b.posts=(data||[]).map(postFromRow);app.save();app.render();
  }
  function watchTeacherBoard() {
    const b=app.board();if(!db||!b?.share_code)return;
    if(teacherChannel)db.removeChannel(teacherChannel);
    teacherChannel=db.channel(`mural:${b.share_code}`,{config:{private:false}}).on('broadcast',{event:'posts_changed'},()=>loadPosts(b).catch(()=>{})).subscribe();
  }
  async function createBoard(title,description) {
    const share_code=crypto.randomUUID().replaceAll('-','');
    const {data,error}=await db.from('boards').insert({owner_id:signedInUser.id,title,description,share_code}).select('id,title,description,share_code').single();
    if(error)throw error;
    return {id:data.id,title:data.title,description:data.description||'',share_code:data.share_code,color:'#77a88e',posts:[],isCloud:true};
  }
  async function managedBoards() {
    if(!signedInUser)return;
    const {data,error}=await db.from('boards').select('id,title,description,share_code').order('created_at',{ascending:false});
    if(error)throw error;
    for(const row of data||[]){let b=app.data.boards.find(x=>x.id===row.id);if(!b){b={...row,color:'#77a88e',posts:[],isCloud:true};app.data.boards.unshift(b)}else Object.assign(b,row,{isCloud:true});await loadPosts(b)}
    if(data?.length){app.data.active=data[0].id;app.save();app.render();watchTeacherBoard();const note=document.querySelector('.local-note');if(note)note.innerHTML='<b>☁ Conectado à nuvem</b>Os murais compartilhados são atualizados ao vivo.'}
  }
  async function uploadExistingImage(code,dataUrl) {
    if(!dataUrl?.startsWith('data:image/'))return null;
    const blob=await (await fetch(dataUrl)).blob();
    const ext=(blob.type.split('/')[1]||'png').replace('jpeg','jpg');
    return upload(code,new File([blob],`projeto.${ext}`,{type:blob.type}));
  }
  async function shareBoard(b) {
    if(!configured){app.toast('A nuvem precisa ser configurada antes de compartilhar.');return}
    if(!signedInUser){app.toast('Entre na conta do professor para criar um link compartilhado.');app.open('authDialog');return}
    if(!b.isCloud){
      try{
        const remote=await createBoard(b.title,b.description);const rows=[];
        for(const p of b.posts)rows.push({board_id:remote.id,author_name:p.name,title:p.title,description:p.description||'',body:p.text||'',image_path:await uploadExistingImage(remote.share_code,p.image)});
        if(rows.length){const {error}=await db.from('posts').insert(rows);if(error)throw error}
        Object.assign(b,remote);app.save();app.render();await loadPosts(b);watchTeacherBoard();
      }catch(e){app.toast(`Não foi possível compartilhar: ${e.message}`);return}
    }
    const link=`${location.origin}${location.pathname}?mural=${encodeURIComponent(b.share_code)}`;
    $('shareLink').textContent=link;$('qrBox').innerHTML='';app.open('shareDialog');
    $('shareDialog').querySelector('.notice').innerHTML='<span>ⓘ</span><div>Qualquer pessoa com este link pode ver o mural e enviar projetos. Evite incluir dados pessoais sensíveis.</div>';
    if(window.QRCode)new QRCode($('qrBox'),{text:link,width:190,height:190,colorDark:'#252a29',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});
  }
  function drawStudentPage(board,rows) {
    document.querySelector('.app').style.display='none';
    document.body.insertAdjacentHTML('afterbegin',`<div id="sharedApp"><header class="topbar"><div class="brand"><div class="brand-mark">✳</div><div><strong>postagens</strong><small>mural colaborativo</small></div></div><span class="crumb" id="liveStatus">● Conectando…</span></header><section class="content"><div class="hero"><div><div class="eyebrow">Mural compartilhado</div><h1 id="sharedTitle"></h1><p id="sharedDescription"></p></div><div class="hero-actions"><button class="btn primary" id="studentAdd">＋ Enviar projeto</button></div></div><div class="notice"><span class="mark">●</span><div>As novas postagens aparecem automaticamente. Todos que receberam o link podem visualizar este mural.</div></div><div class="board-meta"><h2>Projetos da turma</h2><span id="sharedCount"></span></div><div class="post-grid" id="sharedGrid"></div></section></div>`);
    const render=items=>{$('sharedTitle').textContent=board.title;$('sharedDescription').textContent=board.description||'Compartilhe seu projeto com a turma.';$('sharedCount').textContent=`${items.length} ${items.length===1?'postagem':'postagens'}`;$('sharedGrid').innerHTML=items.length?items.map(p=>`<article class="post-card"><div class="post-media">${p.image_path?`<img src="${db.storage.from('post-images').getPublicUrl(p.image_path).data.publicUrl}" alt="Imagem do projeto">`:'✳'}</div><div class="post-content"><div class="post-name">${escapeHtml(p.author_name)}</div><h3 class="post-title">${escapeHtml(p.title)}</h3>${p.description?`<p class="post-desc">${escapeHtml(p.description)}</p>`:''}${p.body?`<p class="post-desc">${escapeHtml(p.body)}</p>`:''}</div><div class="post-footer"><span>${new Date(p.created_at).toLocaleDateString('pt-BR')}</span><span>✳ Projeto da turma</span></div></article>`).join(''):`<div class="empty"><div class="empty-icon">✳</div><strong>Este mural está pronto para receber projetos</strong>Seja o primeiro a compartilhar uma ideia.</div>`};
    render(rows);$('studentAdd').onclick=()=>app.open('postDialog');
    const form=$('postForm');form.addEventListener('submit',async e=>{e.preventDefault();e.stopImmediatePropagation();try{const file=$('projectImage').files[0];const image_path=await upload(shareCode,file);const {error}=await db.rpc('add_shared_post',{p_share_code:shareCode,p_author_name:$('studentName').value.trim(),p_title:$('projectTitle').value.trim(),p_description:$('projectDescription').value.trim(),p_body:$('projectText').value.trim(),p_image_path:image_path});if(error)throw error;app.close('postDialog');form.reset();app.toast('Projeto enviado — a turma já pode ver!')}catch(err){app.toast(`Não foi possível enviar: ${err.message}`)}},true);
    const refresh=async()=>{const {data,error}=await db.rpc('list_shared_posts',{p_share_code:shareCode});if(!error)render(data||[])};
    studentChannel=db.channel(`mural:${shareCode}`,{config:{private:false}}).on('broadcast',{event:'posts_changed'},refresh).subscribe(status=>{$('liveStatus').textContent=status==='SUBSCRIBED'?'● Ao vivo':'○ Reconectando…'});
  }
  async function studentRoute() {
    document.querySelector('.app').style.display='none';
    if(!configured){document.body.insertAdjacentHTML('afterbegin','<main class="content"><div class="hero"><div><div class="eyebrow">Mural compartilhado</div><h1>O mural está aguardando a conexão com a nuvem</h1><p>O responsável precisa configurar o banco de dados do Postagens para ativar as contribuições compartilhadas.</p></div></div></main>');return}
    const {data,error}=await db.rpc('get_shared_board',{p_share_code:shareCode});const board=Array.isArray(data)?data[0]:data;
    if(error||!board){document.body.insertAdjacentHTML('afterbegin','<main class="content"><h1>Mural não encontrado</h1><p>Confira se o link compartilhado está correto.</p></main>');return}
    const {data:rows,error:postError}=await db.rpc('list_shared_posts',{p_share_code:shareCode});if(postError){document.body.insertAdjacentHTML('afterbegin','<main class="content"><h1>Não foi possível carregar as postagens</h1><p>Tente abrir o link novamente.</p></main>');return}drawStudentPage(board,rows||[]);
  }
  function bindTeacher() {
    $('cloudBtn').onclick=async()=>{if(!configured){app.toast('O Supabase ainda não foi configurado.');return}const {data}=await db.auth.getSession();signedInUser=data.session?.user||null;if(signedInUser){try{await managedBoards();app.toast('Murais sincronizados.')}catch(e){app.toast(`Erro na nuvem: ${e.message}`)}}else app.open('authDialog')};
    $('authForm').addEventListener('submit',async e=>{e.preventDefault();if(!configured){app.toast('O Supabase ainda não foi configurado.');return}const {data,error}=await db.auth.signInWithPassword({email:$('authEmail').value.trim(),password:$('authPassword').value});if(error){app.toast(`Não foi possível entrar: ${error.message}`);return}signedInUser=data.user;app.close('authDialog');try{await managedBoards();app.toast('Conectado à nuvem.')}catch(err){app.toast(`Erro ao carregar murais: ${err.message}`)}},true);
    $('signUpBtn').onclick=async()=>{if(!configured){app.toast('O Supabase ainda não foi configurado.');return}const {data,error}=await db.auth.signUp({email:$('authEmail').value.trim(),password:$('authPassword').value});if(error){app.toast(`Não foi possível criar a conta: ${error.message}`);return}if(data.session){signedInUser=data.user;app.close('authDialog');await managedBoards()}else app.toast('Confira seu e-mail para confirmar a conta e depois entre.')};
    $('boardForm').addEventListener('submit',async e=>{if(!configured)return;e.preventDefault();e.stopImmediatePropagation();if(!signedInUser){app.toast('Entre na conta do professor para criar um mural compartilhado.');app.open('authDialog');return}try{const b=await createBoard($('newBoardTitle').value.trim(),$('newBoardDesc').value.trim());app.data.boards.unshift(b);app.data.active=b.id;app.save();app.render();app.close('boardDialog');e.target.reset();watchTeacherBoard();app.toast('Mural compartilhado criado.')}catch(err){app.toast(`Não foi possível criar: ${err.message}`)}},true);
    $('shareBtn').onclick=()=>shareBoard(app.board());
    $('copyLinkBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('shareLink').textContent);app.toast('Link do mural copiado.')}catch{app.toast('Selecione e copie o link exibido.')}};
    document.addEventListener('click',async e=>{const b=app.board(),del=e.target.closest('[data-delete]'),edit=e.target.closest('[data-edit]');if(!b?.isCloud||!signedInUser)return;if(del){e.preventDefault();e.stopImmediatePropagation();if(!confirm('Excluir esta postagem para todos que acessam o mural?'))return;const {error}=await db.from('posts').delete().eq('id',del.dataset.delete);if(error)app.toast('Não foi possível excluir.');else await loadPosts(b)}if(edit){e.preventDefault();e.stopImmediatePropagation();app.startEdit(edit.dataset.edit)}},true);
    document.addEventListener('click',e=>{if(e.target.closest('[data-board]'))setTimeout(watchTeacherBoard,0)},true);
    $('postForm').addEventListener('submit',async e=>{const b=app.board();if(!b?.isCloud)return;e.preventDefault();e.stopImmediatePropagation();if(!signedInUser){app.toast('Entre na conta do professor para editar este mural.');return}try{const editId=app.getEditing(),file=$('projectImage').files[0];let image_path=b.posts.find(p=>p.id===editId)?.image_path||null;if(file)image_path=await upload(b.share_code,file);const values={author_name:$('studentName').value.trim(),title:$('projectTitle').value.trim(),description:$('projectDescription').value.trim(),body:$('projectText').value.trim(),image_path};if(editId){const {error}=await db.from('posts').update(values).eq('id',editId);if(error)throw error}else{const {error}=await db.rpc('add_shared_post',{p_share_code:b.share_code,p_author_name:values.author_name,p_title:values.title,p_description:values.description,p_body:values.body,p_image_path:image_path});if(error)throw error}app.setEditing(null);app.close('postDialog');e.target.reset();await loadPosts(b)}catch(err){app.toast(`Não foi possível salvar: ${err.message}`)}},true);
    if(configured)db.auth.getSession().then(async({data})=>{signedInUser=data.session?.user||null;if(signedInUser)try{await managedBoards()}catch(e){app.toast(`Erro ao sincronizar: ${e.message}`)}});
  }
  if(shareCode)studentRoute();else bindTeacher();
})();

