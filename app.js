const $ = (id) => document.getElementById(id);

const outputFormats = {
  audio: [
    { ext:'mp3', label:'MP3 - universal', codec:['-codec:a','libmp3lame'] },
    { ext:'wav', label:'WAV - sin compresión', codec:['-codec:a','pcm_s16le'] },
    { ext:'ogg', label:'OGG Vorbis', codec:['-codec:a','libvorbis'] },
    { ext:'opus', label:'OPUS - moderno', codec:['-codec:a','libopus'] },
    { ext:'m4a', label:'M4A/AAC', codec:['-codec:a','aac'] },
    { ext:'aac', label:'AAC', codec:['-codec:a','aac'] },
    { ext:'flac', label:'FLAC - sin pérdida', codec:['-codec:a','flac'] }
  ],
  extract: [
    { ext:'mp3', label:'Extraer a MP3', codec:['-codec:a','libmp3lame'] },
    { ext:'wav', label:'Extraer a WAV', codec:['-codec:a','pcm_s16le'] },
    { ext:'ogg', label:'Extraer a OGG', codec:['-codec:a','libvorbis'] },
    { ext:'opus', label:'Extraer a OPUS', codec:['-codec:a','libopus'] },
    { ext:'m4a', label:'Extraer a M4A/AAC', codec:['-codec:a','aac'] },
    { ext:'flac', label:'Extraer a FLAC', codec:['-codec:a','flac'] }
  ],
  video: [
    { ext:'mp4', label:'MP4 H.264/AAC', codec:['-c:v','libx264','-pix_fmt','yuv420p'] },
    { ext:'webm', label:'WebM VP9/Opus', codec:['-c:v','libvpx-vp9'] },
    { ext:'mkv', label:'MKV H.264/AAC', codec:['-c:v','libx264','-pix_fmt','yuv420p'] },
    { ext:'gif', label:'GIF animado (paleta optimizada)', codec:[] }
  ],
  thumbnail: [
    { ext:'jpg', label:'JPG', codec:[] },
    { ext:'png', label:'PNG sin pérdida', codec:[] }
  ]
};

const state = {
  queue: [], activeId: null, mode: 'audio',
  ffmpeg: null, fetchFile: null, busy: false,
  jobIndex: 0, jobTotal: 1,
  deferredInstall: null,
  file: null, fileKind: 'audio' // mirrors the active queue item, for shared helpers
};

let idCounter = 0;
const genId = () => `f${++idCounter}`;

const dropZone = $('dropZone');
const fileInput = $('fileInput');
const videoPreview = $('videoPreview');
const audioPreview = $('audioPreview');
const logBox = $('logBox');

// ---------- small helpers ----------
function log(message){ const time = new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); logBox.textContent += `[${time}] ${message}\n`; logBox.scrollTop = logBox.scrollHeight; }
function escapeHtml(str){ return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatBytes(bytes){ const units=['B','KB','MB','GB']; let n=bytes||0,i=0; while(n>=1024&&i<units.length-1){n/=1024;i++;} return `${n.toFixed(n>=10||i===0?0:1)} ${units[i]}`; }
function formatTime(seconds){ if(!Number.isFinite(seconds)) seconds=0; const h=Math.floor(seconds/3600).toString().padStart(2,'0'); const m=Math.floor((seconds%3600)/60).toString().padStart(2,'0'); const s=Math.floor(seconds%60).toString().padStart(2,'0'); return `${h}:${m}:${s}`; }
function parseTime(value){ if(!value) return null; const clean=value.trim(); if(/^\d+(\.\d+)?$/.test(clean)) return Number(clean); const parts=clean.split(':').map(Number); if(parts.some(Number.isNaN)) return null; if(parts.length===3) return parts[0]*3600+parts[1]*60+parts[2]; if(parts.length===2) return parts[0]*60+parts[1]; return null; }
function safeName(name){ return (name||'archivo').replace(/\.[^/.]+$/,'').replace(/[^a-zA-Z0-9-_ñÑáéíóúÁÉÍÓÚ ]+/g,'').trim().replace(/\s+/g,'-') || 'archivo'; }
function inferKind(file){ return file.type.startsWith('audio/') ? 'audio' : (file.type.startsWith('video/') ? 'video' : (/\.(mp3|wav|ogg|flac|m4a|aac|opus|wma)$/i.test(file.name) ? 'audio' : 'video')); }
function extensionFromFile(file){ const m=file.name.match(/\.([a-z0-9]+)$/i); return m?m[1].toLowerCase():'mp4'; }
function audioMime(ext){ return {mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',opus:'audio/opus',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac'}[ext]||'application/octet-stream'; }
function videoMime(ext){ return {mp4:'video/mp4',webm:'video/webm',mkv:'video/x-matroska'}[ext]||'application/octet-stream'; }
function activePreview(){ return state.fileKind === 'audio' ? audioPreview : videoPreview; }
function getDuration(){ return activePreview().duration || 0; }
function setSelectValue(id, val){ const el=$(id); if([...el.options].some(o=>o.value===val)) el.value=val; }
function validExtension(file){ return file.type.startsWith('video/') || file.type.startsWith('audio/') || /\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|ogg|flac|m4a|aac|opus|wma)$/i.test(file.name); }

function setProgress(ratio, text='Procesando'){
  const pct = Math.max(0, Math.min(100, Math.round(ratio*100)));
  $('progressPct').textContent = `${pct}%`;
  $('progressText').textContent = text;
  const meter = $('ledMeter');
  if(meter.children.length === 0){ for(let i=0;i<40;i++){ meter.appendChild(document.createElement('span')); } }
  const lit = Math.round((pct/100)*40);
  [...meter.children].forEach((el,i)=>{ el.classList.remove('lit-amber','lit-teal'); if(i<lit) el.classList.add(i>=lit-3?'lit-teal':'lit-amber'); });
}

// ---------- mode / format UI ----------
function setMode(mode){
  state.mode = mode;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  $('audioOptions').classList.toggle('hidden', !(mode==='audio'||mode==='extract'));
  $('videoOptions').classList.toggle('hidden', mode!=='video');
  $('thumbnailOptions').classList.toggle('hidden', mode!=='thumbnail');
  document.querySelector('.transform-grid').classList.toggle('hidden', mode==='thumbnail');
  populateFormats();
  updateOutputName();
}
function populateFormats(){ const select=$('outputFormat'); select.innerHTML=''; outputFormats[state.mode].forEach(f=>{ const opt=document.createElement('option'); opt.value=f.ext; opt.textContent=f.label; select.appendChild(opt); }); }
function selectedFormat(){ return outputFormats[state.mode].find(f=>f.ext===$('outputFormat').value); }
function updateOutputName(){ if(!state.file) return; $('outputName').value = `${safeName(state.file.name)}.${$('outputFormat').value}`; }

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('outputFormat').addEventListener('change', updateOutputName);

// ---------- presets ----------
function applyPreset(name){
  if(name==='podcast'){ setMode('audio'); setSelectValue('outputFormat','mp3'); setSelectValue('audioBitrate','128k'); setSelectValue('channels','1'); $('normalize').checked=true; }
  else if(name==='whatsapp'){ setMode('video'); setSelectValue('outputFormat','mp4'); setSelectValue('resolution','854:-2'); setSelectValue('videoQuality','28'); }
  else if(name==='light'){
    if(state.mode==='video'){ setSelectValue('outputFormat','mp4'); setSelectValue('resolution','640:-2'); setSelectValue('videoQuality','32'); }
    else { if(state.mode==='thumbnail') setMode('audio'); setSelectValue('outputFormat','mp3'); setSelectValue('audioBitrate','96k'); }
  }
  else if(name==='max'){
    if(state.mode==='video'){ setSelectValue('resolution','source'); setSelectValue('videoQuality','18'); }
    else { if(state.mode==='thumbnail') setMode('audio'); setSelectValue('outputFormat','flac'); }
  }
  updateOutputName();
  log(`Preset aplicado: ${name}`);
}
document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));

// ---------- queue management ----------
function addFile(file){
  const item = { id: genId(), file, kind: inferKind(file), status:'pending', url:null, previewUrl:null, outputName:null, error:null, size:0 };
  state.queue.push(item);
  return item;
}
function addFiles(fileList){
  const files = Array.from(fileList || []);
  if(!files.length) return;
  const added = [];
  files.forEach(f=>{ if(validExtension(f)) added.push(addFile(f)); });
  if(!added.length){ alert('Ninguno de los archivos tiene un formato de audio/video compatible.'); return; }
  if(files.length !== added.length) log(`${files.length-added.length} archivo(s) omitidos por formato no compatible.`);
  $('workspace').classList.remove('hidden');
  if(!state.activeId) setActive(added[0].id); else renderQueue();
  log(`Agregado${added.length>1?'s':''} a la cola: ${added.map(a=>a.file.name).join(', ')}`);
  window.scrollTo({top:$('workspace').offsetTop-18, behavior:'smooth'});
}
function findItem(id){ return state.queue.find(i=>i.id===id); }
function setActive(id){
  const item = findItem(id); if(!item) return;
  state.activeId = id; state.file = item.file; state.fileKind = item.kind;
  if(!item.previewUrl) item.previewUrl = URL.createObjectURL(item.file);
  videoPreview.classList.toggle('hidden', item.kind==='audio');
  audioPreview.classList.toggle('hidden', item.kind!=='audio');
  activePreview().src = item.previewUrl;
  if(item.kind==='audio' && state.mode==='video') setMode('audio');
  $('fileName').textContent = item.file.name;
  $('metaTitle').value = safeName(item.file.name).replaceAll('-',' ');
  updateOutputName();
  setProgress(0,'Listo para convertir');
  $('fileStats').innerHTML = `<div class="stat"><strong>${formatBytes(item.file.size)}</strong><span>Tamaño</span></div><div class="stat"><strong>${item.file.type||'Detectado por extensión'}</strong><span>Tipo</span></div><div class="stat"><strong id="durationStat">Calculando...</strong><span>Duración</span></div>`;
  renderQueue();
}
function removeItem(id){
  const idx = state.queue.findIndex(i=>i.id===id); if(idx===-1) return;
  const [item] = state.queue.splice(idx,1);
  if(item.url) URL.revokeObjectURL(item.url);
  if(item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if(state.activeId===id){
    if(state.queue.length) setActive(state.queue[0].id);
    else { state.activeId=null; state.file=null; $('workspace').classList.add('hidden'); }
  }
  renderQueue();
}
function statusLabel(item){
  switch(item.status){
    case 'pending': return 'En espera';
    case 'converting': return 'Convirtiendo…';
    case 'done': return formatBytes(item.size);
    case 'error': return item.error || 'Error';
    case 'skipped': return item.error || 'Omitido';
    default: return '';
  }
}
function renderQueue(){
  $('queueCount').textContent = `${state.queue.length} archivo${state.queue.length===1?'':'s'}`;
  const list = $('queueList'); list.innerHTML = '';
  state.queue.forEach(item=>{
    const li = document.createElement('li');
    li.className = `queue-item status-${item.status}`;
    li.innerHTML = `<span class="qi-dot"></span><span class="qi-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span><span class="qi-meta">${escapeHtml(statusLabel(item))}</span><span class="qi-actions"></span>`;
    const actions = li.querySelector('.qi-actions');
    if(item.id !== state.activeId){
      const useBtn = document.createElement('button'); useBtn.type='button'; useBtn.className='btn subtle'; useBtn.textContent='Vista previa'; useBtn.addEventListener('click',()=>setActive(item.id)); actions.appendChild(useBtn);
    }
    if(item.status==='done' && item.url){
      const dl = document.createElement('a'); dl.className='btn subtle'; dl.href=item.url; dl.download=item.outputName; dl.textContent='Descargar'; actions.appendChild(dl);
    }
    const rm = document.createElement('button'); rm.type='button'; rm.className='btn subtle'; rm.textContent='Quitar'; rm.addEventListener('click',()=>removeItem(item.id)); actions.appendChild(rm);
    list.appendChild(li);
  });
  $('convertBtn').textContent = state.queue.length>1 ? `Convertir todo (${state.queue.length})` : 'Convertir archivo';
}

[videoPreview,audioPreview].forEach(el=>el.addEventListener('loadedmetadata',()=>{ const stat=$('durationStat'); if(stat) stat.textContent=formatTime(el.duration); }));
['dragenter','dragover'].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.add('dragover')}));
['dragleave','drop'].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.remove('dragover')}));
dropZone.addEventListener('drop', e=>addFiles(e.dataTransfer.files));
dropZone.addEventListener('click', ()=>fileInput.click());
$('selectBtn').addEventListener('click', e=>{e.stopPropagation();fileInput.click()});
$('changeFileBtn').addEventListener('click', ()=>fileInput.click());
fileInput.addEventListener('change', e=>{ addFiles(e.target.files); fileInput.value=''; });
$('setStartBtn').addEventListener('click', ()=>$('trimStart').value=formatTime(activePreview().currentTime));
$('setEndBtn').addEventListener('click', ()=>$('trimEnd').value=formatTime(activePreview().currentTime));
$('resetTrimBtn').addEventListener('click', ()=>{$('trimStart').value='00:00:00';$('trimEnd').value=''});

async function loadFFmpeg(){

    if(state.ffmpeg){
        return state.ffmpeg;
    }

    $('engineStatus').textContent =
        'Cargando motor...';

    $('engineStatus').classList.remove(
        'ready'
    );

    log(
        'Cargando motor FFmpeg desde archivos locales.'
    );

    try{

        const ffmpegModule =
            await import(
                './ffmpeg/lib/index.js'
            );

        const utilModule =
            await import(
                './ffmpeg/util/index.js'
            );

        const FFmpeg =
            ffmpegModule.FFmpeg;

        const fetchFile =
            utilModule.fetchFile;


        if(typeof FFmpeg !== 'function'){

            throw new Error(
                'No se encontró la clase FFmpeg.'
            );

        }

        if(typeof fetchFile !== 'function'){

            throw new Error(
                'No se encontró la función fetchFile.'
            );

        }



        const ffmpeg =
            new FFmpeg();

        ffmpeg.on(
            'log',
            ({ message }) => {

                if(
                    message &&
                    !message.includes('deprecated')
                ){

                    log(message);

                }

            }
        );

        ffmpeg.on(
            'progress',
            ({ progress }) => {

                const clamped =
                    Math.max(
                        0,
                        Math.min(
                            1,
                            progress || 0
                        )
                    );

                const overall =
                    (
                        (state.jobIndex - 1) +
                        clamped
                    ) /
                    Math.max(
                        1,
                        state.jobTotal
                    );

                setProgress(
                    overall,
                    'Convirtiendo'
                );

            }
        );

const coreURL =
    new URL(
        './ffmpeg/core/ffmpeg-core.js',
        window.location.href
    ).href;

const wasmURL =
    new URL(
        './ffmpeg/core/ffmpeg-core.wasm',
        window.location.href
    ).href;

log(
    'Verificando archivo ffmpeg-core.js.'
);

const coreResponse =
    await fetch(
        coreURL,
        {
            cache: 'no-store'
        }
    );

if(!coreResponse.ok){

    throw new Error(
        `No se pudo cargar ffmpeg-core.js. HTTP ${coreResponse.status}`
    );

}

log(
    'Verificando archivo ffmpeg-core.wasm.'
);

const wasmResponse =
    await fetch(
        wasmURL,
        {
            cache: 'no-store'
        }
    );

if(!wasmResponse.ok){

    throw new Error(
        `No se pudo cargar ffmpeg-core.wasm. HTTP ${wasmResponse.status}`
    );

}

log(
    'Iniciando motor FFmpeg desde el mismo dominio.'
);

await ffmpeg.load({
    coreURL,
    wasmURL
});

        state.ffmpeg =
            ffmpeg;

        state.fetchFile =
            fetchFile;

        $('engineStatus').textContent =
            'Motor listo';

        $('engineStatus').classList.add(
            'ready'
        );

        log(
            'Motor FFmpeg cargado correctamente.'
        );

        return ffmpeg;

    }catch(error){

        state.ffmpeg =
            null;

        state.fetchFile =
            null;

        $('engineStatus').textContent =
            'Error al cargar motor';

        $('engineStatus').classList.remove(
            'ready'
        );

        const message =
            error &&
            error.message
                ? error.message
                : String(error);

        log(
            `ERROR FFmpeg: ${message}`
        );

        console.error(
            'Error cargando FFmpeg:',
            error
        );

        throw error;

    }

}

function rotateFilters(){
  const rot=$('rotateVal').value;
  if(rot==='90') return ['transpose=1'];
  if(rot==='180') return ['transpose=1,transpose=1'];
  if(rot==='270') return ['transpose=2'];
  if(rot==='flipH') return ['hflip'];
  return [];
}
function audioFilters(){
  const filters=[];
  if($('volumeBoost').value!=='1') filters.push(`volume=${$('volumeBoost').value}`);
  if($('normalize').checked) filters.push('loudnorm=I=-16:LRA=11:TP=-1.5');
  if($('fadeIn').checked) filters.push('afade=t=in:st=0:d=2');
  if($('fadeOut').checked){ const end=parseTime($('trimEnd').value)??getDuration(); const start=parseTime($('trimStart').value)??0; const duration=Math.max(0,end-start); if(duration>2) filters.push(`afade=t=out:st=${Math.max(0,duration-2).toFixed(2)}:d=2`); }
  if($('stripSilence').checked) filters.push('silenceremove=stop_periods=-1:stop_duration=1:stop_threshold=-45dB');
  const speed=$('speedVal').value; if(speed!=='1') filters.push(`atempo=${speed}`);
  return filters;
}
function videoFilters(){
  const filters=[];
  if($('resolution').value!=='source') filters.push(`scale=${$('resolution').value}`);
  if($('fps').value!=='source') filters.push(`fps=${$('fps').value}`);
  filters.push(...rotateFilters());
  const speed=$('speedVal').value; if(speed!=='1') filters.push(`setpts=PTS/${speed}`);
  return filters;
}
function gifFilters(){
  const filters=[];
  const res = $('resolution').value!=='source' ? $('resolution').value : '480:-1';
  filters.push(`scale=${res}:flags=lanczos`);
  filters.push(`fps=${$('fps').value!=='source' ? $('fps').value : '12'}`);
  filters.push(...rotateFilters());
  const speed=$('speedVal').value; if(speed!=='1') filters.push(`setpts=PTS/${speed}`);
  return filters;
}

// ---------- conversion ----------
function finalizeItem(item, data, mime, ext){
  const blob = new Blob([data.buffer], {type: mime});
  if(item.url) URL.revokeObjectURL(item.url);
  item.url = URL.createObjectURL(blob);
  const customName = (state.queue.length===1 && $('outputName').value.trim()) ? $('outputName').value.trim().replace(/\.[a-z0-9]+$/i,'') : safeName(item.file.name);
  item.outputName = `${customName}.${ext}`;
  item.size = blob.size;
  item.status = 'done';
}

async function convertItem(item, jobIndex, jobTotal){
  item.status='converting'; renderQueue();
  state.jobIndex=jobIndex; state.jobTotal=jobTotal;
  try{
    const ffmpeg = await loadFFmpeg();
    const fmt = selectedFormat();
    const inputName = `in_${item.id}.${extensionFromFile(item.file)}`;
    try{await ffmpeg.deleteFile(inputName)}catch{}
    await ffmpeg.writeFile(inputName, await state.fetchFile(item.file));
    const start = parseTime($('trimStart').value) ?? 0;
    const end = parseTime($('trimEnd').value);
    const title=$('metaTitle').value.trim(), artist=$('metaArtist').value.trim();

    if(state.mode==='thumbnail'){
      if(item.kind!=='video'){ item.status='skipped'; item.error='No es un video'; renderQueue(); }
      else{
        const outputName=`out_${item.id}.${fmt.ext}`;
        try{await ffmpeg.deleteFile(outputName)}catch{}
        const seek = start>0 ? start : 0.5;
        const args=['-ss',String(seek),'-i',inputName,'-frames:v','1'];
        if(fmt.ext==='jpg') args.push('-q:v','2');
        args.push(outputName);
        log(`[${item.file.name}] ffmpeg ${args.join(' ')}`);
        await ffmpeg.exec(args);
        const data = await ffmpeg.readFile(outputName);
        finalizeItem(item, data, fmt.ext==='jpg'?'image/jpeg':'image/png', fmt.ext);
        try{await ffmpeg.deleteFile(outputName)}catch{}
      }
    } else if(state.mode==='video' && fmt.ext==='gif'){
      const paletteName=`pal_${item.id}.png`, outputName=`out_${item.id}.gif`;
      try{await ffmpeg.deleteFile(paletteName)}catch{} try{await ffmpeg.deleteFile(outputName)}catch{}
      const gf = gifFilters();
      const seekArgs = start>0 ? ['-ss',String(start)] : [];
      const durArgs = (end!==null && end>start) ? ['-t',String(end-start)] : [];
      const pass1=[...seekArgs,'-i',inputName,...durArgs,'-vf',`${gf.join(',')},palettegen=stats_mode=diff`,paletteName];
      log(`[${item.file.name}] paso 1/2 (paleta): ffmpeg ${pass1.join(' ')}`);
      await ffmpeg.exec(pass1);
      const pass2=[...seekArgs,'-i',inputName,...durArgs,'-i',paletteName,'-filter_complex',`${gf.join(',')}[x];[x][1:v]paletteuse=dither=bayer`,'-loop','0',outputName];
      log(`[${item.file.name}] paso 2/2 (render): ffmpeg ${pass2.join(' ')}`);
      await ffmpeg.exec(pass2);
      const data = await ffmpeg.readFile(outputName);
      finalizeItem(item, data, 'image/gif', 'gif');
      try{await ffmpeg.deleteFile(paletteName)}catch{} try{await ffmpeg.deleteFile(outputName)}catch{}
    } else {
      const outputName=`out_${item.id}.${fmt.ext}`;
      try{await ffmpeg.deleteFile(outputName)}catch{}
      const args=[];
      if(start>0) args.push('-ss',String(start));
      args.push('-i',inputName);
      if(end!==null && end>start) args.push('-t',String(end-start));
      if(state.mode==='audio'||state.mode==='extract'){
        args.push('-vn',...fmt.codec);
        if(fmt.ext!=='wav'&&fmt.ext!=='flac') args.push('-b:a',$('audioBitrate').value);
        args.push('-ar',$('sampleRate').value,'-ac',$('channels').value);
        const af=audioFilters(); if(af.length) args.push('-af',af.join(','));
      } else {
        const noTransform = $('rotateVal').value==='none' && $('speedVal').value==='1';
        if($('copyWhenPossible').checked && noTransform){ args.push('-c','copy'); }
        else{
          args.push(...fmt.codec,'-crf',$('videoQuality').value);
          if(fmt.ext==='mp4'||fmt.ext==='mkv') args.push('-preset','veryfast');
          if(fmt.ext==='webm') args.push('-b:v','0');
          const vf=videoFilters(); if(vf.length) args.push('-vf',vf.join(','));
          if($('videoAudioMode').value==='remove') args.push('-an');
          else { args.push('-c:a',fmt.ext==='webm'?'libopus':'aac','-b:a',$('audioBitrate').value); const af=audioFilters(); if(af.length) args.push('-af',af.join(',')); }
        }
        if(fmt.ext==='mp4'&&$('fastStart').checked) args.push('-movflags','+faststart');
      }
      if(title) args.push('-metadata',`title=${title}`);
      if(artist) args.push('-metadata',`artist=${artist}`);
      if(state.mode!=='video') args.push('-id3v2_version','3');
      args.push(outputName);
      log(`[${item.file.name}] ffmpeg ${args.join(' ')}`);
      await ffmpeg.exec(args);
      const data = await ffmpeg.readFile(outputName);
      const mime = ['mp3','m4a','aac','ogg','opus','wav','flac'].includes(fmt.ext) ? audioMime(fmt.ext) : videoMime(fmt.ext);
      finalizeItem(item, data, mime, fmt.ext);
      try{await ffmpeg.deleteFile(outputName)}catch{}
    }
    try{await ffmpeg.deleteFile(inputName)}catch{}
  }catch(error){
    console.error(error);
    item.status='error'; item.error=(error&&error.message)||'Error desconocido';
    log(`[${item.file.name}] Error: ${item.error}`);
  }
  renderQueue();
}

async function convertQueue(){
  if(state.busy) return;
  if(!state.queue.length){ alert('Agrega al menos un archivo.'); return; }
  state.busy=true; $('convertBtn').disabled=true; $('cancelBtn').classList.remove('hidden');
  setProgress(0.01,'Preparando');
  const total = state.queue.length;
  for(let i=0;i<state.queue.length;i++){
    if(!state.busy) break;
    await convertItem(state.queue[i], i+1, total);
  }
const completed =
    state.queue.filter(
        item => item.status === 'done'
    ).length;

const failed =
    state.queue.filter(
        item =>
            item.status === 'error' ||
            item.status === 'skipped'
    ).length;

if(failed > 0){

    setProgress(
        completed / Math.max(1, total),
        `Proceso finalizado con ${failed} error(es)`
    );

    log(
        `Lote finalizado: ${completed} convertido(s), ${failed} con error.`
    );

}else{

    setProgress(
        1,
        'Conversión terminada'
    );

    log(
        'Lote terminado correctamente.'
    );

}
  state.busy=false; $('convertBtn').disabled=false; $('cancelBtn').classList.add('hidden');
}

$('convertBtn').addEventListener('click', convertQueue);
$('cancelBtn').addEventListener('click', async ()=>{ try{ if(state.ffmpeg) await state.ffmpeg.terminate(); }catch{} location.reload(); });

// ---------- PWA install ----------
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); state.deferredInstall=e; $('installBtn').classList.remove('hidden'); });
$('installBtn').addEventListener('click', async ()=>{ if(!state.deferredInstall) return; state.deferredInstall.prompt(); await state.deferredInstall.userChoice; state.deferredInstall=null; $('installBtn').classList.add('hidden'); });
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>navigator.serviceWorker.register('./sw.js')); }

// ---------- init ----------
if(location.protocol === 'file:'){ $('protocolWarning').classList.remove('hidden'); }
setMode('audio');
setProgress(0,'Listo para convertir');
