'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
                                                       '&' : '&amp;',
                                                       '<' : '&lt;',
                                                       '>' : '&gt;',
                                                       '"' : '&quot;',
                                                       "'" : '&#39;'
                                                     }[c]));
const num = v => Math.max(0, Number(v) || 0);
const duration = v => {
  const s = num(v);
  return s >= 3600 ? `${Math.floor(s / 3600)}小时${Math.floor(s % 3600 / 60)}分`
         : s >= 60 ? `${Math.floor(s / 60)}分${s % 60}秒`
                   : `${s}秒`;
};
const empty = (title, subtitle = '') =>
    `<div class="empty"><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>`;
const state = {
  records : [],
  loaded : false,
  status : null,
  dataLimit : 12,
  replayLimit : 12,
  busy : false,
  wifiPending : false,
  signature : ''
};
const titles = {
  data : [
    '训练数据', 'YOUR TRAINING, IN DETAIL', '每一次努力，都有迹可循。',
    '回顾训练的节奏，发现一点一滴的进步。'
  ],
  replays : [
    '训练回放', 'A MOMENT TO LOOK BACK', '回看动作，也看见成长。',
    '让每一段训练，都成为下一次进步的起点。'
  ],
  devices : [
    '我的设备', 'YOUR CONNECTED SPACE', '连接设备，专注当下。',
    '训练数据在身边，设备状态一目了然。'
  ]
};
function route() {
  const key =
      Object.prototype.hasOwnProperty.call(titles, location.hash.slice(1))
          ? location.hash.slice(1)
          : 'data';
  document.querySelectorAll('.page').forEach(e => e.hidden =
                                                 e.id !== `page-${key}`);
  document.querySelectorAll('[data-page]').forEach(e => {
    e.classList.toggle('active', e.dataset.page === key);
    if (e.dataset.page === key)
      e.setAttribute('aria-current', 'page');
    else
      e.removeAttribute('aria-current');
  });
  ['breadcrumb', 'page-eyebrow', 'page-title', 'page-subtitle'].forEach(
      (id, i) => $('#' + id).textContent = titles[key][i]);
  window.scrollTo(0, 0);
}
function message(text) {
  $('#message').textContent = text;
  $('#message').hidden = !text;
}
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
      String(d.getDate()).padStart(2, '0')}`;
}
function sessionTitle(r) {
  return r.action === 'session' || r.action === '训练'
             ? '综合训练'
             : (r.action || '综合训练');
}
function filtered(kind) {
  const query = $(`#${kind}-search`).value.trim().toLowerCase();
  const days = $(`#${kind}-period`).value;
  const action = kind === 'data' ? $('#data-action').value : 'all';
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - Number(days) + 1);
  return state.records.filter(r => {
    const text = `${r.id} ${r.date} ${r.action} ${r.details}`;
    return (kind === 'data' || r.replay_available) &&
           (!query || text.toLowerCase().includes(query)) &&
           (action === 'all' || text.includes(action)) &&
           (days === 'all' ||
            (new Date(String(r.date).replace(' ', 'T')) >= since));
  });
}
function groupScores(r, group) {
  const reps=repDetails(r).map((p,index)=>({...p,index})).filter(p=>p.group===group);
  return reps.length ? '<ol>'+reps.map(p=>
    `<li>第${p.rep}次：<strong>${p.score>=0?p.score.toFixed(1)+'分':'无法评分'}</strong> ${r.replay_available&&p.start>=0&&p.end>p.start?
      `<button class="button secondary" data-play="${esc(r.id)}" data-rep="${p.index}">回放此动作</button>`:
      '<span class="muted">无可定位片段</span>'}</li>`).join('')+'</ol>' :
    '<p class="muted">此组没有逐次评分记录。</p>';
}
function steps(r) {
  const lines=String(r.details||'').trim().split('\n').filter(l=>l && !l.startsWith('@rep '));
  const covered=new Set();
  let html=lines.map(line=>{
    const m=line.match(/^\s*(\d+)\.\s*(.*?)\s+(?:目标|计划)(\d+)(次|秒)\s+完成(\d+)(次|秒)\s*$/);
    if(!m)return `<p class="raw-details">${esc(line)}</p>`;
    const group=Number(m[1]);covered.add(group);
    const title=`${m[1]}. ${m[2]}　目标${m[3]}${m[4]}　完成${m[5]}${m[6]}`;
    return m[4]==='次' ? `<details class="rep-details" data-group="${group}"><summary>${esc(title)}</summary>${groupScores(r,group)}</details>` :
      `<p class="step-rest">${esc(title)}</p>`;
  }).join('');
  for(const p of repDetails(r)){
    if(covered.has(p.group))continue;
    covered.add(p.group);
    html+=`<details class="rep-details" data-group="${p.group}"><summary>第${p.group}组 · ${p.action===1?'深蹲':'俯卧撑'}</summary>${groupScores(r,p.group)}</details>`;
  }
  return html || '<p class="muted">此记录没有逐次评分和动作明细，仍可播放完整录像。</p>';
}
function renderData() {
  if (!state.loaded)
    return;
  const list = filtered('data');
  $('#record-count').textContent = list.length;
  const open = new Set(
      [...document.querySelectorAll('.record[open]') ].map(e => e.dataset.id));
  $('#records').innerHTML =
      list.slice(0, state.dataLimit)
          .map(
              r => `<details class="record" data-id="${esc(r.id)}" ${
                  open.has(String(r.id))
                      ? 'open'
                      : ''}><summary><span class="record-icon" aria-hidden="true">▤</span><div class="record-title"><h3>${
                  esc(sessionTitle(r))}</h3><p>${esc(r.date)} · NO. ${
                  esc(String(r.id).slice(-8))}</p></div><div class="record-stat">${
                  num(r.count)} 次<small>示范播放</small></div><div class="record-stat">${
                  duration(
                      r.duration_secs)}<small>训练时长</small></div><span class="record-arrow" aria-hidden="true">⌄</span></summary><div class="record-body"><h3>本次训练明细</h3>${
                  similarityCard(r)}${steps(r)}<div class="record-bottom"><span>${
                  r.replay_available ? '回放已上传云端'
                  : r.replay_state === 'pending' ? '回放待上传' : r.replay_state === 'missing' ? '板端录像暂不可用，等待补传' : r.replay_path ? '录像尚未上传'
                                     : '本次未保存录像'}</span>${
                  r.replay_available
                      ? `<button class="button secondary small" data-play="${
                            esc(r.id)}">▷ 查看回放</button>`
                      : ''}</div></div></details>`)
          .join('') ||
      empty(state.records.length ? '没有符合条件的训练' : '还没有训练记录',
            state.records.length
                ? '试试其他关键词或时间范围'
                : '训练保存并上传成功后，记录会出现在这里。');
  $('#more-data').hidden = list.length <= state.dataLimit;
}
function repDetails(r) {
  return String(r.details||'').split('\n').filter(l=>l.startsWith('@rep ')).map(l=>{
    const fields=l.trim().split(/\s+/);if(fields.length!==7)return null;
    const [group,action,rep,score,start,end]=fields.slice(1).map(Number);
    if(![group,action,rep,score,start,end].every(Number.isFinite)||!Number.isInteger(group)||group<1||group>8||
       ![1,2].includes(action)||!Number.isInteger(rep)||rep<1||score < -1||score>100)return null;
    return {group,action,rep,score,start,end};
  }).filter(Boolean);
}
function repPanel(r) { return steps(r); }
function similarityCard(r) {
  const score=r.similarity_score;
  const valid=typeof score==='number' && Number.isFinite(score) && score>=0 && score<=100 && num(r.similarity_reps)>0;
  return `<section class="similarity-card"><h3>总评分</h3><strong>${valid ? `${score.toFixed(1)}分` : '评分 --'}</strong><p>${valid ? `基于 ${num(r.similarity_reps)} 次有效动作评分。` : '本次没有有效评分。'}</p></section>`;
}
function renderReplays() {
  if (!state.loaded)
    return;
  const all = state.records.filter(r => r.replay_available),
        list = filtered('replay');
  $('#replay-total').textContent = all.length;
  $('#replay-count').textContent = `共 ${list.length} 段录像`;
  $('#replays').innerHTML =
      list.slice(0, state.replayLimit)
          .map(
              r => `<article class="replay-card"><button class="replay-cover" data-play="${
                  esc(r.id)}" aria-label="播放 ${esc(r.date)} ${
                  esc(sessionTitle(
                      r))}"><span class="cover-lines"></span><span class="cover-label">TRAINING ARCHIVE</span><span class="play-circle" aria-hidden="true">▷</span><span class="cover-time">训练 ${
                  duration(
                      r.duration_secs)}</span></button><div class="replay-content"><h3>${
                  esc(sessionTitle(r))}</h3><p>${
                  esc(r.date)}</p><div class="replay-foot"><span>${
                  num(r.count)} 次播放 / 计数</span><span>查看回放 ↗</span></div>${repPanel(r)}</div></article>`)
          .join('') ||
      empty(
          all.length ? '没有找到匹配的回放' : '还没有可播放的录像',
          '录像上传完成后会显示在这里；待上传的录像可在训练档案查看状态。');
  $('#more-replays').hidden = list.length <= state.replayLimit;
  loadReplayPreviews();
}
function renderStats() {
  const r = state.records;
  const mins = r.reduce((s, x) => s + num(x.duration_secs), 0) / 60;
  const values = [
    [ '累计训练', r.length, '次', '每一次坚持，都值得记录' ],
    [ '累计时长', mins.toFixed(1), '分钟', '来自已保存的训练' ],
    [
      '示范播放', r.reduce((s, x) => s + num(x.count), 0), '次',
      '逐次积累，慢慢进步'
    ],
    [
      '可用回放', r.filter(x => x.replay_available).length, '段',
      '回顾细节，发现变化'
    ]
  ];
  $('#metrics').innerHTML =
      values
          .map(([ t, v, u, n ]) =>
                   `<article class="metric"><span>${t}</span><strong>${
                       v}<small>${u}</small></strong><p>${n}</p></article>`)
          .join('');
  const days = Array.from({length : 7}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return {
      d,
      n : r.filter(x => String(x.date).slice(0, 10) === localDate(d)).length
    };
  });
  const max = Math.max(1, ...days.map(x => x.n));
  $('#activity').innerHTML =
      days.map(({d, n},
                i) => `<div class="day ${i === 6 ? 'today' : ''}" aria-label="${
                   localDate(d)} ${n}次训练"><b>${n}</b><i style="height:${
                   Math.max(3, 48 * n / max)}px"></i><span>${
                   i === 6
                       ? '今天'
                       : `${d.getMonth() + 1}/${d.getDate()}`}</span></div>`)
          .join('');
}

let session=null, generation=0, playGeneration=0;
const rememberKey='sport-coach-session-v1';
let tokenRefresh=null;
function forgetDevice(){try{localStorage.removeItem(rememberKey);}catch(e){}}
function saveDevice(s){
  if(!s.rememberUntil)return;
  try{localStorage.setItem(rememberKey,JSON.stringify(s));}
  catch(e){s.rememberUntil=0;message('浏览器不允许保存登录信息，下次仍需登录。');}
}
async function renewSession(s){
  if(s.expiresAt>Date.now()+60000)return;
  if(!s.refreshToken)throw Error('登录已过期，请退出后重新登录');
  if(tokenRefresh)return tokenRefresh;
  const run=generation;
  tokenRefresh=(async()=>{
    const auth=await request({base:s.base,key:s.key},'/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:s.refreshToken})});
    if(run!==generation||session!==s)throw Error('登录状态已改变');
    if(!auth.access_token||!auth.refresh_token||auth.user?.id!==s.owner)throw Error('登录账号校验失败，请重新登录');
    s.token=auth.access_token;s.refreshToken=auth.refresh_token;s.expiresAt=Date.now()+(Number(auth.expires_in)||3600)*1000;saveDevice(s);
  })();
  try{await tokenRefresh;}finally{tokenRefresh=null;}
}
let previewObserver=null, previewEpoch=0;
const previewStops=new Set();
function clearReplayPreviews(){
  previewEpoch++;previewObserver?.disconnect();previewObserver=null;
  for(const stop of [...previewStops])stop();
  document.querySelectorAll('.replay-preview').forEach(video=>{video.removeAttribute('src');video.load();video.remove();});
}
async function replayURL(s,r){
  const signed=await request(s,'/storage/v1/object/sign/training-replays/'+r.cloud_replay,{method:'POST',body:JSON.stringify({expiresIn:3600})});
  if(typeof signed.signedURL!=='string')throw Error('视频地址缺失');
  const url=new URL(signed.signedURL.startsWith('/storage/v1/')?signed.signedURL:'/storage/v1'+signed.signedURL,s.base);
  if(url.origin!==s.base||!url.pathname.startsWith('/storage/v1/object/sign/training-replays/'))throw Error('视频地址不合法');
  return url.href;
}
function loadReplayPreviews(){
  clearReplayPreviews();if(!session)return;
  const s=session,epoch=previewEpoch,run=generation,queue=[];let active=0;
  const current=button=>epoch===previewEpoch&&run===generation&&button.isConnected;
  async function load(button){
    const r=state.records.find(x=>String(x.id)===button.dataset.play);if(!r?.replay_available)return;
    try{
      const url=await replayURL(s,r);if(!current(button))return;
      await new Promise(resolve=>{
        const video=document.createElement('video');video.className='replay-preview';video.muted=true;video.playsInline=true;video.preload='auto';video.tabIndex=-1;video.setAttribute('aria-hidden','true');
        let done=false;const stop=()=>finish(false);
        function finish(ready){if(done)return;done=true;clearTimeout(timer);previewStops.delete(stop);video.onloadeddata=video.onseeked=video.onerror=null;
          if(ready&&current(button)){video.pause();button.classList.add('preview-ready');}
          else{video.removeAttribute('src');video.load();video.remove();}
          resolve();
        }
        const timer=setTimeout(()=>finish(false),15000);previewStops.add(stop);
        video.onloadeddata=()=>{if(!current(button)){finish(false);return;}try{video.currentTime=0;}catch(e){finish(false);}};
        video.onseeked=()=>finish(true);video.onerror=()=>finish(false);
        button.prepend(video);video.src=url;video.load();
      });
    }catch(e){/* Keep the clean default cover; full playback can still be retried. */}
  }
  function pump(){if(epoch!==previewEpoch)return;while(active<2&&queue.length){active++;load(queue.shift()).finally(()=>{active--;pump();});}}
  previewObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){previewObserver.unobserve(entry.target);queue.push(entry.target);}}pump();},{rootMargin:'100px'});
  document.querySelectorAll('#replays .replay-cover').forEach(button=>previewObserver.observe(button));
}
async function decrypt(encoded,pass){
  const raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  if(new TextDecoder().decode(raw.slice(0,8))!=='Salted__')throw Error('加密格式不匹配');
  const secret=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);
  for(const n of [8,16]){try{
    const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:raw.slice(8,8+n),iterations:100000,hash:'SHA-256'},secret,384));
    const key=await crypto.subtle.importKey('raw',bits.slice(0,32),'AES-CBC',false,['decrypt']);
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-CBC',iv:bits.slice(32)},key,raw.slice(8+n))));
  }catch(e){}}
  throw Error('记录解密失败，请核对口令');
}
async function request(s,path,options={}){
  if(s===session){
    if(s.rememberUntil&&Date.now()>=s.rememberUntil){forgetDevice();throw Error('记住设备已满 7 天，请退出后重新登录');}
    await renewSession(s);
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(s.base+path,{...options,signal:controller.signal,cache:'no-store',headers:{apikey:s.key,...(s.token?{Authorization:'Bearer '+s.token}:{}),'Content-Type':'application/json',...options.headers}});
    if(!response.ok)throw Error(response.status===401?'登录已过期，请退出后重新登录':`云端请求失败 (${response.status})`);
    return await response.json();
  }finally{clearTimeout(timer);}
}
async function allRows(s,table,query){
  const result=[];
  for(let offset=0;;offset+=200){
    const rows=await request(s,`/rest/v1/${table}?${query}&limit=200&offset=${offset}`);
    if(!Array.isArray(rows))throw Error('云端数据格式错误');
    result.push(...rows);if(rows.length<200)return result;
  }
}
async function refresh(){
  if(!session||state.busy)return;
  const s=session,run=generation;state.busy=true;$('#refresh').disabled=true;
  try{
    // Stable IDs are event keys; board-local numeric IDs can repeat across devices/resets.
    const rows=await allRows(s,'training_archive_v2','select=event_key,encrypted_payload&order=created_at.desc,event_key.desc');
    const records=[];let failed=0;const notices=[];
    for(const row of rows){try{
      const r=await decrypt(row.encrypted_payload,s.pass);
      if(!r||typeof r!=='object')throw Error('invalid record');
      const object=String(r.cloud_replay||'');
      const valid=object===`${s.owner}/${row.event_key}.mp4`&&/^[0-9a-f]{32}$/.test(row.event_key);
      records.push({...r,id:row.event_key,cloud_replay:valid?object:'',replay_available:valid&&r.replay_state==='ready'});
    }catch(e){failed++;}}
    if(s.legacy){
      try{
        const old=await allRows(s,'workout_log',`select=*&device_id=eq.${encodeURIComponent(s.legacy)}&order=id.desc`);
        for(const row of old){try{
          const r=row.encrypted_payload?await decrypt(row.encrypted_payload,s.legacyPass):row;
          records.push({...r,id:'legacy-'+row.id,replay_available:false,replay_state:'none',cloud_replay:'',similarity_score:null,similarity_reps:0});
        }catch(e){failed++;}}
      }catch(e){notices.push('旧版历史读取失败，请检查旧设备编号及表权限');}
    }
    if(run!==generation)return;
    state.records=records.sort((a,b)=>String(b.date).localeCompare(String(a.date)));state.loaded=true;
    renderStats();renderData();renderReplays();
    $('#connection').textContent='云端已连接';$('#connection').className='connection online';
    $('#updated').textContent='上次读取 '+new Date().toLocaleTimeString('zh-CN');
    if(failed)notices.push(`${failed} 条记录无法解密，请核对口令`);
    message(notices.join('；'));
  }catch(e){if(run===generation){message(e.message+(state.loaded?'；当前保留上次读取结果':''));$('#connection').textContent='云端更新失败';}}
  finally{if(run===generation){state.busy=false;$('#refresh').disabled=false;}}
}
$('#login-form').onsubmit=async e=>{
  e.preventDefault();const run=++generation;$('#cloud-submit').disabled=true;
  try{
    const base=$('#cloud-url').value.trim().replace(/\/$/,''),key=$('#cloud-key').value.trim();
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base))throw Error('请填写 Supabase HTTPS 项目地址');
    if(key.startsWith('sb_secret_'))throw Error('网页只能使用公开客户端密钥');
    if(key.split('.').length===3){
      let role;try{role=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role;}catch(e){throw Error('密钥格式错误');}
      if(role!=='anon')throw Error('网页不能使用管理员或用户访问令牌');
    }
    const auth=await request({base,key},'/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('#cloud-email').value.trim(),password:$('#cloud-password').value})});
    if(run!==generation)return;
    if(!auth.access_token||!auth.user?.id)throw Error('登录响应缺少账号信息');
    forgetDevice();
    session={base,key,token:auth.access_token,refreshToken:auth.refresh_token,expiresAt:Date.now()+(Number(auth.expires_in)||3600)*1000,rememberUntil:$('#remember-device').checked?Date.now()+7*86400000:0,owner:auth.user.id,pass:$('#cloud-passphrase').value,legacy:$('#legacy-device').value.trim(),legacyPass:$('#legacy-passphrase').value||$('#cloud-passphrase').value};
    saveDevice(session);
    $('#cloud-login').hidden=true;$('#cloud-logout').hidden=false;state.busy=false;await refresh();
  }catch(e){if(run===generation)message(e.message);}
  finally{$('#cloud-password').value='';$('#cloud-passphrase').value='';$('#legacy-passphrase').value='';$('#cloud-submit').disabled=false;}
};
$('#cloud-logout').onclick=()=>{
  forgetDevice();
  clearReplayPreviews();
  generation++;playGeneration++;session=null;state.records=[];state.loaded=false;state.busy=false;
  $('#player').close();$('#video').removeAttribute('src');$('#video').load();$('#download').removeAttribute('href');
  for(const id of ['records','replays','metrics','activity'])$('#'+id).replaceChildren();
  $('#record-count').textContent='—';$('#replay-total').textContent='—';$('#replay-count').textContent='';
  $('#cloud-password').value='';$('#cloud-passphrase').value='';$('#legacy-passphrase').value='';
  $('#cloud-login').hidden=false;$('#cloud-logout').hidden=true;$('#connection').textContent='已退出';$('#connection').className='connection';$('#updated').textContent='等待登录';message('');
};
function clipBounds(r, index, duration) {
  const reps=repDetails(r), clip=reps[index];
  if(!clip || clip.start<0 || clip.end<=clip.start || !Number.isFinite(duration) || clip.start>=duration)return null;
  // Keep a settling tail after the scoring cycle. Never include the next
  // complete repetition or seek beyond the available recording.
  const next=reps.slice(index+1).find(p=>p.start>=clip.end && p.end>p.start);
  let end=Math.min(clip.end+1.0,duration);
  if(next)end=Math.min(end,Math.max(clip.end,next.end-0.05));
  return {start:Math.max(0,clip.start-1.0),end};
}
let activeClip=null,clipFrame=0,clipTimer=0;
function stopClipWatch(){cancelAnimationFrame(clipFrame);clearInterval(clipTimer);clipTimer=0;clipFrame=0;activeClip=null;}
function watchClip(){
  cancelAnimationFrame(clipFrame);
  const video=$('#video');
  if(!activeClip)return;
  if(video.currentTime>=activeClip.end){
    video.pause();clearInterval(clipTimer);clipTimer=0;
    if(video.currentTime>activeClip.end)video.currentTime=activeClip.end;
    return;
  }
  if(!video.paused)clipFrame=requestAnimationFrame(watchClip);
}
$('#video').addEventListener('timeupdate',watchClip);
$('#video').addEventListener('play',()=>{
  clearInterval(clipTimer);
  if(activeClip)clipTimer=setInterval(watchClip,20);
  if(activeClip&&($('#video').currentTime>=activeClip.end||$('#video').currentTime<activeClip.start))
    $('#video').currentTime=activeClip.start;
  watchClip();
});
$('#video').addEventListener('pause',()=>{clearInterval(clipTimer);clipTimer=0;});
$('#video').addEventListener('seeked',()=>{
  if(activeClip&&$('#video').currentTime<activeClip.start)$('#video').currentTime=activeClip.start;
  if(activeClip&&$('#video').currentTime>=activeClip.end)$('#video').pause();
});
document.addEventListener('click',async e=>{
  const close=e.target.closest('[data-close]');if(close)$('#'+close.dataset.close).close();
  const play=e.target.closest('[data-play]');if(!play||!session)return;
  const r=state.records.find(x=>String(x.id)===play.dataset.play);if(!r?.replay_available)return;
  const s=session,run=generation,playRun=++playGeneration;
  stopClipWatch();$('#video').pause();$('#video').onloadedmetadata=null;
  const index=play.dataset.rep;
  const clip=index===undefined?null:repDetails(r)[Number(index)];
  if(index!==undefined&&(!clip||clip.start<0||clip.end<=clip.start))return;
  try{
    const url=await replayURL(s,r);
    if(run!==generation||playRun!==playGeneration)return;
    $('#player-title').textContent=sessionTitle(r);$('#player-meta').textContent=`${r.date} · ${duration(r.duration_secs)}`;
    $('#video-error').hidden=true;$('#video').src=url;$('#download').href=url;$('#download').download=`training_${r.id}.mp4`;
    $('#video').onloadedmetadata=()=>{
      if(run!==generation||playRun!==playGeneration)return;
      const video=$('#video');
      if(clip){
        if(!Number.isFinite(video.duration)||clip.start>=video.duration){
          $('#video-error').textContent='动作时间段超出录像范围，请播放完整录像。';$('#video-error').hidden=false;return;
        }
        activeClip=clipBounds(r,Number(index),video.duration);
        if(!activeClip)return;
        video.currentTime=activeClip.start;
        $('#player-meta').textContent=`${r.date} · 第${clip.group}组第${clip.rep}次 · ${activeClip.start.toFixed(1)}–${activeClip.end.toFixed(1)}秒`;
      }
      video.play().catch(()=>{});
    };
    if(!$('#player').open)$('#player').showModal();
  }catch(e){if(run===generation)message('回放加载失败：'+e.message);}
});
$('#player').addEventListener('close',()=>{playGeneration++;stopClipWatch();$('#video').onloadedmetadata=null;$('#video').pause();$('#video').removeAttribute('src');$('#video').load();$('#download').removeAttribute('href');});
$('#video').addEventListener('error',()=>{if(!$('#video').getAttribute('src'))return;$('#video-error').textContent='回放无法播放，请重新打开以刷新授权链接；也可下载检查视频格式。';$('#video-error').hidden=false;});
for(const id of ['data-search','data-period','data-action'])$('#'+id).addEventListener('input',()=>{state.dataLimit=12;renderData();});
for(const id of ['replay-search','replay-period'])$('#'+id).addEventListener('input',()=>{state.replayLimit=12;renderReplays();});
$('#more-data').onclick=()=>{state.dataLimit+=12;renderData();};$('#more-replays').onclick=()=>{state.replayLimit+=12;renderReplays();};
$('#refresh').onclick=refresh;
function cloudRoute(){if(location.hash==='#devices')location.hash='#data';route();}
window.addEventListener('hashchange',cloudRoute);cloudRoute();
$('#records').innerHTML=empty('登录后查看训练档案','已上传的记录不依赖板端在线。');
$('#cloud-url').value=window.CLOUD_CONFIG?.url||'';$('#cloud-key').value=window.CLOUD_CONFIG?.key||'';
async function restoreDevice(){
  let saved;
  try{saved=JSON.parse(localStorage.getItem(rememberKey)||'null');}catch(e){forgetDevice();return;}
  if(!saved)return;
  const configured=window.CLOUD_CONFIG?.url;
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(saved.base)||
     (configured&&saved.base!==configured)||!saved.refreshToken||typeof saved.pass!=='string'||
     !Number.isFinite(saved.rememberUntil)||saved.rememberUntil<=Date.now()){
    forgetDevice();return;
  }
  session=saved;const run=generation;
  $('#cloud-login').hidden=true;$('#cloud-logout').hidden=false;$('#connection').textContent='正在恢复登录…';
  try{
    // Refresh on each reopening; don't rely on a stale cached access token.
    session.expiresAt=0;await renewSession(session);
    if(run!==generation)return;
    await refresh();
  }catch(e){
    if(run!==generation)return;
    session=null;$('#cloud-login').hidden=false;$('#cloud-logout').hidden=true;
    $('#connection').textContent='自动登录未完成';message('自动登录失败，请检查网络或重新登录。');
  }
}
restoreDevice();
