const $ = selector => document.querySelector(selector);
const panel = $('#showMePanel');
const trigger = $('#showMeButton');
const status = $('#showMeStatus');
const timer = $('#showMeTimer');
const startButton = $('#showMeStart');
const stopButton = $('#showMeStop');
let recorder = null;
let screen = null;
let microphone = null;
let previewStream = null;
let previewVideo = null;
let chunks = [];
let frames = [];
let startedAt = 0;
let tick = null;
let sample = null;
let cap = null;
let audioIncluded = false;

const dataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read the recording.'));
  reader.readAsDataURL(blob);
});

function setOpen(open) {
  panel.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
  if (open) $('#showMeName').focus();
  else trigger.focus();
}

function release() {
  clearInterval(tick); clearInterval(sample); clearTimeout(cap);
  screen?.getTracks().forEach(track => track.stop());
  microphone?.getTracks().forEach(track => track.stop());
  previewStream = null; screen = null; microphone = null;
  if (previewVideo) { previewVideo.srcObject = null; previewVideo.remove(); previewVideo = null; }
}

function clock() {
  const left = Math.max(0, 30 - Math.floor((performance.now() - startedAt) / 1000));
  timer.textContent = `00:${String(left).padStart(2, '0')}`;
  if (left <= 5) timer.classList.add('is-ending');
}

function captureFrame() {
  if (!previewVideo || previewVideo.readyState < 2 || frames.length >= 16) return;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 960 / (previewVideo.videoWidth || 960));
  canvas.width = Math.max(1, Math.round(previewVideo.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(previewVideo.videoHeight * scale));
  canvas.getContext('2d').drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
  const frame = canvas.toDataURL('image/jpeg', .65);
  const atMs = Math.min(30000, Math.round(performance.now() - startedAt));
  if (frames.length && atMs <= frames.at(-1).atMs) return;
  if (frame.length < 650000) frames.push({atMs, data:frame});
}

function stopRecording() {
  if (!recorder || recorder.state === 'inactive') return;
  clearTimeout(cap); clearInterval(sample); clearInterval(tick);
  captureFrame();
  recorder.stop();
  startButton.disabled = true;
  stopButton.disabled = true;
  status.textContent = 'Saving clip and visual samples…';
}

async function saveRecording() {
  const durationMs = Math.min(30000, Math.round(performance.now() - startedAt));
  const blob = new Blob(chunks, {type:recorder.mimeType || chunks[0]?.type || 'video/webm'});
  release();
  recorder = null;
  if (!blob.size) { status.textContent = 'No recording was captured. Try again.'; startButton.disabled = false; return; }
  if (blob.size > 30 * 1024 * 1024) { status.textContent = 'Clip exceeded 30 MB. Try sharing a smaller window.'; startButton.disabled = false; return; }
  if (!frames.length) { status.textContent = 'The clip has no visible frames. Try recording again.'; startButton.disabled = false; return; }
  try {
    const response = await fetch('/api/show-me/clips', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        title:$('#showMeName').value.trim() || 'Screen recording',
        durationMs, mimeType:blob.type, audio:audioIncluded,
        video:await dataUrl(blob), frames,
      }),
    });
    const clip = await response.json();
    if (!response.ok) throw new Error(clip.error || 'Could not save the clip.');
    $('#showMeLatest').hidden = false;
    $('#showMePreview').src = clip.videoUrl;
    $('#showMeDownload').href = clip.videoUrl;
    $('#showMeDownload').download = `${clip.id}.${clip.mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
    $('#showMeLatestTitle').textContent = `${clip.title} · v${clip.version}`;
    $('#showMeLatestMeta').textContent = `${Math.round(clip.durationMs / 1000)}s · ${clip.frameCount} visual samples${clip.audio ? ' · mic audio saved' : ''}`;
    $('#showMeUseInChat').onclick = () => {
      document.dispatchEvent(new CustomEvent('countdesk:show-me-select',{detail:{id:clip.id}}));
      setOpen(false);
    };
    status.textContent = `Saved ${clip.id} in Recent. Use the camera in chat to send its visual samples.`;
    document.dispatchEvent(new CustomEvent('countdesk:show-me-saved',{detail:clip}));
  } catch (error) {
    status.textContent = `Save failed: ${error.message}`;
  } finally {
    chunks = []; frames = []; startButton.disabled = false;
    timer.textContent = '00:30'; timer.classList.remove('is-ending');
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
    status.textContent = 'This browser cannot record screen clips. Use a current browser on localhost.';
    return;
  }
  startButton.disabled = true;
  status.textContent = 'Choose the tab, window, or screen to record…';
  try {
    screen = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:12, width:{ideal:1280}}, audio:false});
    if ($('#showMeAudio').checked) {
      try {
        microphone = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true}, video:false});
      } catch (error) {
        status.textContent = 'Microphone permission was denied. Recording without audio.';
      }
    }
    audioIncluded = Boolean(microphone?.getAudioTracks().some(track => track.readyState === 'live'));
    const tracks = [...screen.getVideoTracks(), ...(microphone?.getAudioTracks() || [])];
    previewStream = new MediaStream(screen.getVideoTracks());
    previewVideo = document.createElement('video');
    previewVideo.muted = true; previewVideo.playsInline = true;
    previewVideo.srcObject = previewStream;
    await previewVideo.play();
    const mimeType = ['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(new MediaStream(tracks), {
      ...(mimeType ? {mimeType} : {}), videoBitsPerSecond:1_200_000,
    });
    chunks = []; frames = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = saveRecording;
    recorder.onerror = () => { status.textContent = 'Recorder failed. Please try again.'; stopRecording(); };
    screen.getVideoTracks()[0].addEventListener('ended', stopRecording, {once:true});
    recorder.start(1000);
    startedAt = performance.now();
    stopButton.disabled = false;
    timer.classList.remove('is-ending'); clock();
    setTimeout(captureFrame, 450);
    sample = setInterval(captureFrame, 2000);
    tick = setInterval(clock, 250);
    cap = setTimeout(stopRecording, 30000);
    status.textContent = audioIncluded ? 'Recording screen + microphone. Stops at 30 seconds.' : 'Recording screen. Stops at 30 seconds.';
  } catch (error) {
    release(); recorder = null; startButton.disabled = false; stopButton.disabled = true;
    status.textContent = error.name === 'NotAllowedError' ? 'Screen selection was canceled or blocked.' : `Could not start recording: ${error.message}`;
  }
}

trigger.addEventListener('click', () => setOpen(panel.hidden));
$('#showMeClose').addEventListener('click', () => setOpen(false));
startButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) setOpen(false); });
