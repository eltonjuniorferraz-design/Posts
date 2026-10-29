(() => {
  const projectUrl = 'https://wgedkhmotadlnzrjjzru.supabase.co';
  const publicKey = 'sb_publishable_Lwdrkt8EFTgNUA37gOzUUA_RISYGQQe';
  const configured = window.supabase && !projectUrl.includes('SEU-PROJETO') && publicKey.length > 20 && !publicKey.includes('COLE_');
  const db = configured ? window.supabase.createClient(projectUrl, publicKey) : null;
  const app = window.PostagensState;
  const $ = id => document.getElementById(id);
  const safeColor = (value,fallback) => /^#[0-9a-f]{6}$/i.test(value||'') ? value : fallback;
  const publicImage = path => path ? db.storage.from('post-images').getPublicUrl(path).data.publicUrl : '';
  const paintBoard = (element,color,image) => {const selected=safeColor(color,'#f7f5ef');element.style.backgroundColor=selected;element.style.setProperty('--board-background',selected);element.style.setProperty('--board-background-image',image?`url(\"${String(image).replace(/[\"\\\\]/g,'')}\")`:'none')};
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const voterId=()=>{try{let id=localStorage.getItem('mural-reaction-voter');if(!id){id=crypto.randomUUID();localStorage.setItem('mural-reaction-voter',id)}return id}catch{return crypto.randomUUID()}};
  const shareCode = new URLSearchParams(location.search).get('mural');
  let signedInUser = null, teacherChannel = null, studentChannel = null;

  function postFromRow(row) {
    const image = row.image_path ? db.storage.from('post-images').getPublicUrl(row.image_path).data.publicUrl : '';
    return {id:row.id,name:row.author_name,title:row.title,description:row.description||'',text:row.body||'',image,image_path:row.image_path||'',mediaColor:safeColor(row.media_color,'#eff2ed'),cardColor:safeColor(row.card_color,'#ffffff'),heartCount:Number(row.heart_count)||0,thumbCount:Number(row.thumb_count)||0,myReactions:Array.isArray(row.my_reactions)?row.my_reactions:[],createdAt:new Date(row.created_at).getTime()};
  }
  async function prepareBackgroundUpload(file) {
    const limit=3*1024*1024;
    if(file.type==='image/gif')return file;
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){if(file.size<=limit)return file;throw new Error('Escolha uma imagem JPG, PNG ou WebP de até 3 MB, ou um GIF de até 3 MB.')}
    let bitmap;
    try{bitmap=await createImageBitmap(file)}catch{if(file.size<=limit)return file;throw new Error('Não foi possível reduzir esta foto. Tente uma imagem JPG, PNG ou WebP menor que 3 MB.')}
    let blob=null;
    try{
      const scale=Math.min(1,2000/bitmap.width,1500/bitmap.height);
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.82,.72,.62,.52]){
        blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
        if(!blob||blob.size<=limit)break;
      }
    }finally{bitmap.close?.()}
    if(blob&&blob.size<=limit&&blob.size<file.size)return new File([blob],String(file.name||'fundo').replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
    if(file.size<=limit)return file;
    throw new Error('A imagem não pôde ser reduzida para o limite de 3 MB. Escolha outra imagem.');
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
    const {data,error}=await db.rpc('list_shared_posts',{p_share_code:b.share_code,p_voter_id:voterId()});
    if(error)throw error;
    b.posts=(data||[]).map(postFromRow);app.save();app.render();
  }
  function watchTeacherBoard() {
    const b=app.board();if(!db||!b?.share_code)return;
    if(teacherChannel)db.removeChannel(teacherChannel);
    teacherChannel=db.channel(`mural:${b.share_code}`,{config:{private:false}}).on('broadcast',{event:'posts_changed'},()=>loadPosts(b).catch(()=>{})).on('broadcast',{event:'board_changed'},async()=>{const {data,error}=await db.from('boards').select('background_color').eq('id',b.id).maybeSingle();if(!error&&data){b.backgroundColor=safeColor(data.background_color,'#f7f5ef');b.background_image_path=data.background_image_path;b.backgroundImage=publicImage(data.background_image_path);app.save();app.render()}}).subscribe();
  }
  async function createBoard(title,description,backgroundColor='#f7f5ef',backgroundImage='') {
    const share_code=crypto.randomUUID().replaceAll('-','');
    const {data,error}=await db.from('boards').insert({owner_id:signedInUser.id,title,description,share_code,background_color:safeColor(backgroundColor,'#f7f5ef')}).select('id,title,description,share_code,background_color,background_image_path').single();
    if(error)throw error;
    let background_image_path=null;
    if(String(backgroundImage||'').startsWith('data:image/')){background_image_path=await uploadExistingImage(share_code,backgroundImage);const {error:imageError}=await db.from('boards').update({background_image_path}).eq('id',data.id).eq('owner_id',signedInUser.id);if(imageError)throw imageError}
    return {id:data.id,title:data.title,description:data.description||'',share_code:data.share_code,backgroundColor:safeColor(data.background_color,'#f7f5ef'),background_image_path,backgroundImage:background_image_path?publicImage(background_image_path):'',color:'#77a88e',posts:[],isCloud:true};
  }
  async function managedBoards() {
    if(!signedInUser)return;
    app.data.boards=app.data.boards.filter(b=>!b.isCloud);
    if(!app.data.boards.some(b=>b.id===app.data.active)&&app.data.boards.length)app.data.active=app.data.boards[0].id;
    const {data,error}=await db.from('boards').select('id,title,description,share_code,background_color,background_image_path').order('created_at',{ascending:false});
    if(error)throw error;
    for(const row of data||[]){let b=app.data.boards.find(x=>x.id===row.id);if(!b){b={...row,backgroundColor:safeColor(row.background_color,'#f7f5ef'),background_image_path:row.background_image_path,backgroundImage:publicImage(row.background_image_path),color:'#77a88e',posts:[],isCloud:true};app.data.boards.unshift(b)}else Object.assign(b,row,{backgroundColor:safeColor(row.background_color,'#f7f5ef'),background_image_path:row.background_image_path,backgroundImage:publicImage(row.background_image_path),isCloud:true});await loadPosts(b)}
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
        const remote=await createBoard(b.title,b.description,b.backgroundColor,b.backgroundImage);
        app.data.boards.unshift(remote);app.data.active=remote.id;app.save();app.render();watchTeacherBoard();b=remote;
      }catch(e){app.toast(`Não foi possível compartilhar: ${e.message}`);return}
    }
    const link=`${location.origin}${location.pathname}?mural=${encodeURIComponent(b.share_code)}`;
    $('shareLink').textContent=link;$('qrBox').innerHTML='';app.open('shareDialog');
    $('shareDialog').querySelector('.notice').innerHTML='<span>ⓘ</span><div>Qualquer pessoa com este link pode ver o mural e enviar projetos. O conteúdo local antigo fica neste aparelho; só as novas postagens deste mural serão compartilhadas. Evite dados pessoais sensíveis.</div>';
    if(window.QRCode)new QRCode($('qrBox'),{text:link,width:190,height:190,colorDark:'#252a29',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});
  }
  const editTokens=()=>{try{return JSON.parse(localStorage.getItem('mural-post-edit-tokens')||'{}')}catch{return {}}};
  function saveEditToken(code,id,token){const all=editTokens();all[code]??={};all[code][id]=token;localStorage.setItem('mural-post-edit-tokens',JSON.stringify(all))}
  function drawStudentPage(board,rows) {
    document.querySelector('.app').style.display='none';
    document.body.insertAdjacentHTML('afterbegin',`<div id="sharedApp"><header class="topbar"><div class="brand"><div class="brand-mark">✳</div><div><strong>Muralê</strong><small>mural colaborativo</small></div></div><span class="crumb" id="liveStatus">● Conectando…</span></header><section class="content" id="sharedCanvas"><div class="hero"><div><div class="eyebrow">Mural compartilhado</div><h1 id="sharedTitle"></h1><p id="sharedDescription"></p></div><div class="hero-actions"><button class="btn primary" id="studentAdd">＋ Enviar projeto</button></div></div><div class="notice"><span class="mark">●</span><div>As novas postagens aparecem automaticamente. Todos que receberam o link podem visualizar este mural.</div></div><div class="board-meta"><h2>Projetos da turma</h2><div class="board-tools"><input id="sharedSearch" class="board-search" type="search" placeholder="Buscar projeto ou autor" aria-label="Buscar postagens"><span id="sharedCount"></span></div></div><div class="post-grid" id="sharedGrid"></div></section></div>`);
    let editingStudentPost=null;const render=items=>{paintBoard($('sharedCanvas'),board.background_color||board.backgroundColor||'#f7f5ef',board.backgroundImage||publicImage(board.background_image_path));$('sharedTitle').textContent=board.title;$('sharedDescription').textContent=board.description||'Compartilhe seu projeto com a turma.';const query=($('sharedSearch').value||'').trim().toLocaleLowerCase('pt-BR');const visible=items.filter(p=>!query||[p.author_name,p.title,p.description,p.body].some(value=>app.plainRich(value).toLocaleLowerCase('pt-BR').includes(query)));$('sharedCount').textContent=query?`${visible.length} de ${items.length} postagens`:`${items.length} ${items.length===1?'postagem':'postagens'}`;$('sharedGrid').innerHTML=visible.length?visible.map(p=>`<article class="post-card" style="background-color:${safeColor(p.card_color,'#ffffff')}"><div class="post-media" style="background-color:${safeColor(p.media_color,'#eff2ed')}">${p.image_path?`<img src="${db.storage.from('post-images').getPublicUrl(p.image_path).data.publicUrl}" alt="Imagem do projeto">`:'✳'}</div><div class="post-content"><div class="post-name">${escapeHtml(p.author_name)}</div><h3 class="post-title">${escapeHtml(p.title)}</h3>${p.description?`<p class="post-desc">${app.cleanRich(p.description)}</p>`:''}${p.body?`<p class="post-desc">${app.cleanRich(p.body)}</p>`:''}</div>${app.reactionMarkup(p.id,p.heart_count,p.thumb_count,p.my_reactions,!!editTokens()[shareCode]?.[p.id])}<div class="post-footer"><span>${new Date(p.created_at).toLocaleDateString('pt-BR')}</span><span class="post-controls">${editTokens()[shareCode]?.[p.id]?`<button data-student-edit="${escapeHtml(p.id)}">Editar minha postagem</button>`:"✳ Projeto da turma"}</span></div></article>`).join(''):`<div class="empty"><div class="empty-icon">✳</div><strong>Este mural está pronto para receber projetos</strong>Seja o primeiro a compartilhar uma ideia.</div>`};
    render(rows);$('sharedSearch').addEventListener('input',()=>render(rows));$('studentAdd').onclick=()=>{editingStudentPost=null;app.setEditing(null);$('postForm').reset();app.setRich('projectDescription','');app.setRich('projectText','');$('postMediaColor').value='#eff2ed';$('postCardColor').value='#ffffff';$('postDialogTitle').textContent='Nova postagem';app.open('postDialog')};
    document.addEventListener('click',async e=>{const button=e.target.closest('[data-reaction]');if(!button)return;e.preventDefault();e.stopImmediatePropagation();if(editTokens()[shareCode]?.[button.dataset.postId]){app.toast('Você pode reagir aos projetos dos colegas.');return}try{const {error}=await db.rpc('toggle_shared_reaction',{p_share_code:shareCode,p_post_id:button.dataset.postId,p_voter_id:voterId(),p_reaction:button.dataset.reaction});if(error)throw error;await refresh()}catch(err){app.toast('Não foi possível registrar a reação: '+err.message)}});
    document.addEventListener('click',e=>{const button=e.target.closest('[data-student-edit]');if(!button)return;const post=rows.find(x=>x.id===button.dataset.studentEdit),token=editTokens()[shareCode]?.[button.dataset.studentEdit];if(!post||!token)return;editingStudentPost=post.id;$('postForm').reset();$('studentName').value=post.author_name;$('projectTitle').value=post.title;app.setRich('projectDescription',post.description||'');app.setRich('projectText',post.body||'');$('postMediaColor').value=safeColor(post.media_color,'#eff2ed');$('postCardColor').value=safeColor(post.card_color,'#ffffff');$('postDialogTitle').textContent='Editar minha postagem';$('projectImage').required=false;app.setEditing(post.id);app.open('postDialog')});
    const form=$('postForm');form.addEventListener('submit',async e=>{e.preventDefault();e.stopImmediatePropagation();if(!app.validateRich())return;try{const file=$('projectImage').files[0];const image_path=file?await upload(shareCode,file):(editingStudentPost?rows.find(p=>p.id===editingStudentPost)?.image_path:null);let result;if(editingStudentPost){const token=editTokens()[shareCode]?.[editingStudentPost];if(!token)throw new Error('Código de edição não encontrado neste aparelho.');result=await db.rpc('update_shared_post',{p_share_code:shareCode,p_post_id:editingStudentPost,p_edit_token:token,p_author_name:$('studentName').value.trim(),p_title:$('projectTitle').value.trim(),p_description:app.getRich('projectDescription'),p_body:app.getRich('projectText'),p_image_path:image_path,p_media_color:$('postMediaColor').value,p_card_color:$('postCardColor').value})}else{result=await db.rpc('add_shared_post',{p_share_code:shareCode,p_author_name:$('studentName').value.trim(),p_title:$('projectTitle').value.trim(),p_description:app.getRich('projectDescription'),p_body:app.getRich('projectText'),p_image_path:image_path,p_media_color:$('postMediaColor').value,p_card_color:$('postCardColor').value});const created=result.data?.[0];if(created?.id&&created?.edit_token)saveEditToken(shareCode,created.id,created.edit_token)}if(result.error)throw result.error;editingStudentPost=null;app.setEditing(null);app.close('postDialog');form.reset();await refresh();app.toast('Projeto salvo — você poderá editar esta postagem neste aparelho.')}catch(err){app.toast(`Não foi possível salvar: ${err.message}`)}},true);
    const refresh=async()=>{const {data,error}=await db.rpc('list_shared_posts',{p_share_code:shareCode,p_voter_id:voterId()});if(!error){rows=data||[];render(rows)}};
    studentChannel=db.channel(`mural:${shareCode}`,{config:{private:false}}).on('broadcast',{event:'posts_changed'},refresh).on('broadcast',{event:'board_changed'},async()=>{const {data,error}=await db.rpc('get_shared_board',{p_share_code:shareCode});const latest=Array.isArray(data)?data[0]:data;if(!error&&latest){Object.assign(board,latest,{backgroundImage:publicImage(latest.background_image_path)});await refresh()}}).subscribe(status=>{$('liveStatus').textContent=status==='SUBSCRIBED'?'● Ao vivo':'○ Reconectando…'});
  }
  async function studentRoute() {
    document.querySelector('.app').style.display='none';
    if(!configured){document.body.insertAdjacentHTML('afterbegin','<main class="content"><div class="hero"><div><div class="eyebrow">Mural compartilhado</div><h1>O mural está aguardando a conexão com a nuvem</h1><p>O responsável precisa configurar o banco de dados do Postagens para ativar as contribuições compartilhadas.</p></div></div></main>');return}
    const {data,error}=await db.rpc('get_shared_board',{p_share_code:shareCode});const board=Array.isArray(data)?data[0]:data;
    if(error||!board){document.body.insertAdjacentHTML('afterbegin','<main class="content"><h1>Mural não encontrado</h1><p>Confira se o link compartilhado está correto.</p></main>');return}
    const {data:rows,error:postError}=await db.rpc('list_shared_posts',{p_share_code:shareCode,p_voter_id:voterId()});if(postError){document.body.insertAdjacentHTML('afterbegin','<main class="content"><h1>Não foi possível carregar as postagens</h1><p>Tente abrir o link novamente.</p></main>');return}drawStudentPage(board,rows||[]);
  }
  function bindTeacher() {
    const lockPage=()=>{document.body.classList.remove('teacher-open','auth-checking');document.body.classList.add('auth-required');$('cloudBtn').textContent='☁ Entrar';$('cloudBtn').setAttribute('aria-label','Entrar na conta do professor')};
    const showChecking=()=>{document.body.classList.remove('teacher-open','auth-required');document.body.classList.add('auth-checking')};
    const unlockPage=()=>{document.body.classList.remove('auth-required','auth-checking');document.body.classList.add('teacher-open');$('cloudBtn').textContent='↪ Sair';$('cloudBtn').setAttribute('aria-label','Sair da conta do professor')};
    const stripCloudCache=()=>{app.data.boards=app.data.boards.filter(b=>!b.isCloud);if(!app.data.boards.length){const fallback={id:'local-first-'+Date.now().toString(36),title:'Meu mural',description:'Crie um mural para começar.',color:'#77a88e',backgroundColor:'#f7f5ef',backgroundImage:'',posts:[]};app.data.boards=[fallback]}if(!app.data.boards.some(b=>b.id===app.data.active))app.data.active=app.data.boards[0].id;app.save();app.render()};
    let recoveryInProgress=false;const setAuthMode=first=>{const dialog=$('authDialog');dialog.querySelector('h2').textContent=first?'Primeiro acesso':'Entrar no Muralê';dialog.querySelector('.sub').textContent=first?'Crie uma conta de professor para guardar seus murais na nuvem.':'Entre com sua conta de professor para acessar seus murais.';$('signUpBtn').classList.toggle('primary',!!first);$('authForm').querySelector('button[type="submit"]').classList.toggle('primary',!first);$('authPassword').autocomplete=first?'new-password':'current-password';$('authPasswordConfirmField').hidden=!first;$('forgotPasswordBtn').hidden=!!first};const openAuth=first=>{setAuthMode(first);app.open('authDialog')};
    const enterWorkspace=async(user,showMessage=false)=>{signedInUser=user;try{await managedBoards();unlockPage();app.close('authDialog');if(showMessage)app.toast('Conectado ao Muralê.')}catch(err){signedInUser=null;stripCloudCache();lockPage();app.toast('Não foi possível carregar seus murais: '+err.message)}};
    showChecking();
    $('welcomeLogin').onclick=()=>openAuth(false);$('welcomeSignup').onclick=()=>openAuth(true);
    const authHint=$('authDialog').querySelector('.hint');
    if(configured&&authHint)authHint.textContent='Primeiro acesso? Crie uma conta de professor e confirme o e-mail. Depois entre para criar murais compartilhados.';
    $('cloudBtn').onclick=async()=>{if(!configured){app.toast('O Supabase ainda não foi configurado.');return}if(!signedInUser){openAuth(false);return}try{const {error}=await db.auth.signOut();if(error)throw error;signedInUser=null;if(teacherChannel){db.removeChannel(teacherChannel);teacherChannel=null}stripCloudCache();lockPage()}catch(err){app.toast('Não foi possível sair da conta: '+err.message)}};
    $('authForm').addEventListener('submit',async e=>{e.preventDefault();setAuthMode(false);if(!configured){app.toast('O Supabase ainda não foi configurado.');return}const {data,error}=await db.auth.signInWithPassword({email:$('authEmail').value.trim(),password:$('authPassword').value});if(error){app.toast(`Não foi possível entrar: ${error.message}`);return}try{sessionStorage.removeItem('mural-password-recovery-pending')}catch{}await enterWorkspace(data.user,true)},true);
    $('showAuthPassword').addEventListener('change',e=>{const type=e.target.checked?'text':'password';$('authPassword').type=type;$('authPasswordConfirm').type=type});
    $('forgotPasswordBtn').onclick=async()=>{const email=$('authEmail');if(!email.value.trim()){email.focus();email.reportValidity();return}if(!configured){app.toast('A recuperação de senha ainda não está conectada.');return}try{const {error}=await db.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;try{sessionStorage.setItem('mural-password-recovery-pending','1')}catch{}app.close('authDialog');app.toast('Se este e-mail estiver cadastrado, enviaremos um link para criar uma nova senha.')}catch(err){app.toast('Não foi possível enviar o link: '+err.message)}};
    $('passwordResetForm').addEventListener('submit',async e=>{e.preventDefault();const password=$('newPassword').value,confirmation=$('newPasswordConfirm').value;if(password.length<8){app.toast('A nova senha precisa ter pelo menos 8 caracteres.');return}if(password!==confirmation){app.toast('As senhas não coincidem. Confira os dois campos.');$('newPasswordConfirm').focus();return}try{const {data,error}=await db.auth.updateUser({password});if(error)throw error;recoveryInProgress=false;try{sessionStorage.removeItem('mural-password-recovery-pending')}catch{}app.close('passwordResetDialog');$('passwordResetForm').reset();await enterWorkspace(data.user||signedInUser,false);app.toast('Senha alterada. Você já pode usar sua conta.')}catch(err){app.toast('Não foi possível alterar a senha: '+err.message)}});
    $('passwordResetDialog').querySelector('[data-close="passwordResetDialog"]').addEventListener('click',()=>{recoveryInProgress=false;try{sessionStorage.removeItem('mural-password-recovery-pending')}catch{}db.auth.signOut().then(()=>{signedInUser=null;stripCloudCache();lockPage()})});
    $('signUpBtn').onclick=async()=>{
      setAuthMode(true);
      const form=$('authForm');
      if(!form.reportValidity())return;
      const password=$('authPassword').value,confirmation=$('authPasswordConfirm').value;if(password!==confirmation){app.toast('As senhas não coincidem. Confira os dois campos.');$('authPasswordConfirm').focus();return}
      if(!configured){app.toast('O Supabase ainda não foi configurado.');return}
      try{
        const {data,error}=await db.auth.signUp({
          email:$('authEmail').value.trim(),
          password:$('authPassword').value,
          options:{emailRedirectTo:location.origin+location.pathname}
        });
        if(error){app.toast(`Não foi possível criar a conta: ${error.message}`);return}
        if(data.session)await enterWorkspace(data.user,true)
        else app.toast('Conta criada. Confira seu e-mail para confirmar o acesso e depois entre.');
      }catch(err){app.toast(`Não foi possível criar a conta: ${err.message}`)}
    };
    $('boardForm').addEventListener('submit',async e=>{if(!configured)return;e.preventDefault();e.stopImmediatePropagation();if(!signedInUser){app.toast('Entre na conta do professor para criar um mural compartilhado.');app.open('authDialog');return}try{const b=await createBoard($('newBoardTitle').value.trim(),$('newBoardDesc').value.trim(),$('boardBackgroundColor').value);app.data.boards.unshift(b);app.data.active=b.id;app.save();app.render();app.close('boardDialog');e.target.reset();watchTeacherBoard();app.toast('Mural compartilhado criado.')}catch(err){app.toast(`Não foi possível criar: ${err.message}`)}},true);
    $('shareBtn').onclick=()=>shareBoard(app.board());
    $('copyLinkBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('shareLink').textContent);app.toast('Link do mural copiado.')}catch{app.toast('Selecione e copie o link exibido.')}};
    document.addEventListener('click',async e=>{const reaction=e.target.closest('[data-reaction]');if(reaction){const active=app.board();if(!active?.isCloud)return;e.preventDefault();e.stopImmediatePropagation();try{const {error}=await db.rpc('toggle_shared_reaction',{p_share_code:active.share_code,p_post_id:reaction.dataset.postId,p_voter_id:voterId(),p_reaction:reaction.dataset.reaction});if(error)throw error;await loadPosts(active)}catch(err){app.toast('Não foi possível registrar a reação: '+err.message)}return}const removeBoard=e.target.closest('[data-delete-board]');if(removeBoard){const doomed=app.data.boards.find(x=>x.id===removeBoard.dataset.deleteBoard);if(!doomed?.isCloud)return;e.preventDefault();e.stopImmediatePropagation();if(!signedInUser){app.toast('Entre na conta do professor para excluir este mural.');return}if(app.data.boards.length<=1){app.toast('Crie outro mural antes de excluir este.');return}if(!confirm('Excluir o mural “'+doomed.title+'” e todas as postagens dele? Esta ação não pode ser desfeita.'))return;try{const {error}=await db.from('boards').delete().eq('id',doomed.id).eq('owner_id',signedInUser.id);if(error)throw error;app.data.boards=app.data.boards.filter(x=>x.id!==doomed.id);if(app.data.active===doomed.id)app.data.active=app.data.boards[0].id;app.save();app.render();watchTeacherBoard();app.toast('Mural excluído.')}catch(err){app.toast('Não foi possível excluir o mural: '+err.message)}return}const b=app.board(),del=e.target.closest('[data-delete]'),edit=e.target.closest('[data-edit]');if(!b?.isCloud)return;if((del||edit)&&!signedInUser){e.preventDefault();e.stopImmediatePropagation();app.toast('Apenas o professor conectado pode editar ou excluir postagens.');return}if(del){e.preventDefault();e.stopImmediatePropagation();if(!confirm('Excluir esta postagem para todos que acessam o mural?'))return;const {error}=await db.from('posts').delete().eq('id',del.dataset.delete);if(error)app.toast('Não foi possível excluir.');else await loadPosts(b)}if(edit){e.preventDefault();e.stopImmediatePropagation();app.startEdit(edit.dataset.edit)}},true);
    document.addEventListener('click',e=>{if(e.target.closest('[data-board]'))setTimeout(watchTeacherBoard,0)},true);
    $('postForm').addEventListener('submit',async e=>{const b=app.board();if(!b?.isCloud)return;e.preventDefault();e.stopImmediatePropagation();if(!signedInUser){app.toast('Entre na conta do professor para editar este mural.');return}if(!app.validateRich())return;try{const editId=app.getEditing(),file=$('projectImage').files[0];let image_path=b.posts.find(p=>p.id===editId)?.image_path||null;if(file)image_path=await upload(b.share_code,file);const values={author_name:$('studentName').value.trim(),title:$('projectTitle').value.trim(),description:app.getRich('projectDescription'),body:app.getRich('projectText'),image_path,media_color:$('postMediaColor').value,card_color:$('postCardColor').value};if(editId){const {error}=await db.from('posts').update(values).eq('id',editId);if(error)throw error}else{const {error}=await db.rpc('add_shared_post',{p_share_code:b.share_code,p_author_name:values.author_name,p_title:values.title,p_description:values.description,p_body:values.body,p_image_path:image_path,p_media_color:values.media_color,p_card_color:values.card_color});if(error)throw error}app.setEditing(null);app.close('postDialog');e.target.reset();await loadPosts(b)}catch(err){app.toast(`Não foi possível salvar: ${err.message}`)}},true);
    document.addEventListener('change',async e=>{if(e.target.id==='boardBackgroundImage'){const b=app.board(),file=e.target.files?.[0];if(!b?.isCloud)return;e.stopImmediatePropagation();e.target.value='';if(!file)return;if(!signedInUser){app.toast('Entre na conta do professor para salvar o painel na nuvem.');return}try{const prepared=await prepareBackgroundUpload(file);const path=await upload(b.share_code,prepared);const {error}=await db.from('boards').update({background_image_path:path}).eq('id',b.id).eq('owner_id',signedInUser.id);if(error)throw error;b.background_image_path=path;b.backgroundImage=publicImage(path);app.save();app.render();app.toast('Imagem aplicada ao painel compartilhado.')}catch(err){app.toast('Não foi possível salvar a imagem: '+err.message)}return}if(e.target.id==='clearBoardBackgroundImage'){const b=app.board();if(!b?.isCloud)return;e.preventDefault();e.stopImmediatePropagation();if(!signedInUser){app.toast('Entre na conta do professor para salvar esta alteração.');return}try{const {error}=await db.from('boards').update({background_image_path:null}).eq('id',b.id).eq('owner_id',signedInUser.id);if(error)throw error;b.background_image_path=null;b.backgroundImage='';app.save();app.render();app.toast('Imagem removida do painel compartilhado.')}catch(err){app.toast('Não foi possível remover a imagem: '+err.message)}return}if(e.target.id!=='boardBackgroundColor')return;const b=app.board();if(!b?.isCloud)return;e.stopImmediatePropagation();if(!signedInUser){e.target.value=b.backgroundColor||'#f7f5ef';app.render();app.toast('Entre na conta do professor para salvar a cor na nuvem.');return}const previous=safeColor(b.backgroundColor,'#f7f5ef'),next=safeColor(e.target.value,'#f7f5ef');try{const {error}=await db.from('boards').update({background_color:next,background_image_path:null}).eq('id',b.id).eq('owner_id',signedInUser.id);if(error)throw error;b.backgroundColor=next;b.background_image_path=null;b.backgroundImage='';e.target.dataset.savedColor=next;app.save();app.render();app.toast('Cor do mural salva e compartilhada.')}catch(err){b.backgroundColor=previous;e.target.value=previous;app.render();app.toast('Não foi possível salvar a cor: '+err.message)}},true);if(configured){db.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){recoveryInProgress=true;signedInUser=session?.user||null;lockPage();app.close('authDialog');app.open('passwordResetDialog')}});db.auth.getSession().then(async({data,error})=>{if(error){stripCloudCache();signedInUser=null;lockPage();app.toast('Não foi possível conferir o acesso: '+error.message);return}if(data.session?.user){let pending=false;try{pending=sessionStorage.getItem('mural-password-recovery-pending')==='1'}catch{}if(pending&&!recoveryInProgress){recoveryInProgress=true;signedInUser=data.session.user;lockPage();app.open('passwordResetDialog');return}if(!recoveryInProgress)await enterWorkspace(data.session.user,false)}else{try{sessionStorage.removeItem('mural-password-recovery-pending')}catch{}signedInUser=null;stripCloudCache();lockPage()}}).catch(err=>{signedInUser=null;stripCloudCache();lockPage();app.toast('Não foi possível conferir o acesso: '+err.message)})}else{stripCloudCache();lockPage()}
  }
  const demoMode=new URLSearchParams(location.search).get('demo')==='1';
  if(shareCode)studentRoute();else if(demoMode){document.body.classList.remove('auth-required','auth-checking');document.body.classList.add('teacher-open','demo-mode');$('cloudBtn').textContent='Sair da demonstração';$('cloudBtn').setAttribute('aria-label','Sair da demonstração');const leaveDemo=()=>{location.href=location.pathname};$('cloudBtn').onclick=leaveDemo;$('demoExit').onclick=leaveDemo;$('welcomeDemo').onclick=()=>{location.href=location.pathname+'?demo=1'};app.toast('Modo demonstração: seus testes ficam salvos neste navegador.')}else{bindTeacher();$('welcomeDemo').onclick=()=>{location.href=location.pathname+'?demo=1'}}
})();

