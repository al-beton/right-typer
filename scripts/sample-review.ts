import type { Sample } from '../src/recording/types';
export function reviewPage(sample: Sample): string {
  const presses = sample.events.flatMap((e) =>
    e.type === 'evidence' && e.event.type === 'request' ? [e.event.press] : [],
  );
  const data = JSON.stringify({
    presses,
    frames: sample.frames,
    labels: presses.map(
      (p) =>
        sample.labels.find((label) => label.pressId === p.id && label.attemptId === p.attemptId)!,
    ),
    sessionId: sample.manifest.sessionId,
  }).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Right Typer sample review</title>
<style>body{font:16px system-ui;max-width:1000px;margin:24px auto;padding:16px}img,video{max-width:100%;max-height:60vh}button,select,input{font:inherit;padding:8px;margin:6px}#frame{background:#eee;min-height:100px}label{display:block}small{display:block}</style>
<h1>Review actual finger use</h1><p>Use the original pixels and the participant’s confirmation. Model predictions are deliberately omitted. If you cannot tell, choose Unlabelable. Labels download separately; original sample files stay unchanged.</p>
<details><summary>Watch full camera video (approximate timing)</summary><video src="camera.webm" controls></video></details>
<p><button id="previous">Previous press</button><span id="position"></span><button id="next">Next press</button></p><h2 id="key"></h2>
<img id="frame" alt="Recorded tracking input frame" /><p id="timing"></p><button id="frame-previous">Earlier frame</button><button id="frame-next">Later frame</button>
<label>Actual finger <select id="finger"><option value="unreviewed">Unreviewed</option><option value="unlabelable">Unlabelable</option>${['left', 'right'].flatMap((h) => ['thumb', 'index', 'middle', 'ring', 'little'].map((d) => `<option value="${h}-${d}">${h} ${d}</option>`)).join('')}</select></label>
<label>Independent source / reviewer notes <input id="source" size="65" placeholder="e.g. Al reviewed adjacent frames; confirmed left index" /></label>
<button id="download">Download label revision</button><p id="status" role="status"></p>
<script>
const data = ${data};
let index=0, frameIndex=0;
const el=id=>document.getElementById(id);
function save(){const label=data.labels[index];if(!label)return;const value=el('finger').value;label.status=['unreviewed','unlabelable'].includes(value)?value:'confirmed';label.finger=label.status==='confirmed'?value:null;label.source=el('source').value;}
function renderFrame(){const frame=data.frames[frameIndex];if(!frame){el('frame').removeAttribute('src');return;}el('frame').src=frame.file;el('timing').textContent='Frame '+frame.id+' · '+(frame.at/1000).toFixed(3)+' s · '+Math.round(frame.at-data.presses[index].at)+' ms from press · '+frame.clock;}
function render(){const press=data.presses[index];if(!press){el('key').textContent='No keypresses in this sample';return;}el('position').textContent=(index+1)+' / '+data.presses.length;el('key').textContent='Key '+(press.key===' '?'space':press.key)+(press.code?' ('+press.code+')':'')+' · press '+press.id+' · attempt '+press.attemptId;el('finger').value=data.labels[index].finger||data.labels[index].status;el('source').value=data.labels[index].source;frameIndex=data.frames.reduce((best,f,i)=>Math.abs(f.at-press.at)<Math.abs(data.frames[best].at-press.at)?i:best,0);renderFrame();}
el('previous').onclick=()=>{save();index=Math.max(0,index-1);render();};el('next').onclick=()=>{save();index=Math.min(data.presses.length-1,index+1);render();};
el('frame-previous').onclick=()=>{frameIndex=Math.max(0,frameIndex-1);renderFrame();};el('frame-next').onclick=()=>{frameIndex=Math.min(data.frames.length-1,frameIndex+1);renderFrame();};
el('download').onclick=()=>{save();if(data.labels.some(l=>l.status==='confirmed'&&!l.source.trim())){el('status').textContent='Each confirmed label needs an independent source.';return;}const url=URL.createObjectURL(new Blob([data.labels.map(l=>JSON.stringify(l)).join('\\n')+'\\n'],{type:'application/x-ndjson'}));const link=document.createElement('a');link.href=url;link.download=data.sessionId+'-labels-'+Date.now()+'.jsonl';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);el('status').textContent='Label revision downloaded. Keep it alongside the original sample.';};render();
</script></html>`;
}
