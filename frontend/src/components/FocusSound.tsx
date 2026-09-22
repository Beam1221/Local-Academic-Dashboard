import {useEffect,useRef,useState} from 'react';
import {request} from '../lib/api';
import {FocusAudio} from '../lib/focusAudio';
type Sound={id:number;name:string;url:string};
type Preferences={kind:string;volume:number};
const types:Record<string,string>={mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac',m4a:'audio/mp4',webm:'audio/webm'};
export function useFocusSound(){
 const [preferences,setPreferences]=useState<Preferences>(()=>{try{return {...{kind:'chime',volume:.65},...JSON.parse(localStorage.getItem('studyspace-focus-sound')||'{}')}}catch{return {kind:'chime',volume:.65}}});
 const [sounds,setSounds]=useState<Sound[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const engine=useRef<FocusAudio|null>(null);const current=useRef(preferences);current.current=preferences;
 const audio=()=>engine.current??(engine.current=new FocusAudio());
 const url=(kind:string)=>kind.startsWith('upload:')?`/api/focus-sounds/${Number(kind.split(':')[1])}/file`:undefined;
 useEffect(()=>{void request<Sound[]>('/focus-sounds').then(setSounds).catch(e=>setError(e.message));return()=>{engine.current?.close();engine.current=null}},[]);
 useEffect(()=>{try{localStorage.setItem('studyspace-focus-sound',JSON.stringify(preferences))}catch{/* Visit-only preferences */}},[preferences]);
 async function arm(){try{if(current.current.kind!=='silent')await audio().arm(url(current.current.kind));setError('')}catch{setError('Sound could not be prepared. Try Test sound or select another alert.')}}
 async function play(){try{await audio().play(current.current.kind,current.current.volume,url(current.current.kind));setError('')}catch{setError('Alert sound could not play. Check browser sound permissions or choose another sound.')}}
 async function upload(file?:File){if(!file)return;setBusy(true);setError('');try{const type=types[file.name.split('.').pop()?.toLowerCase()||''];if(!type||file.size>10*1024*1024)throw new Error('Choose an audio file up to 10 MB.');const response=await fetch('/api/focus-sounds',{method:'POST',headers:{'Content-Type':type,'X-File-Name':encodeURIComponent(file.name)},body:file});if(!response.ok)throw new Error('Sound upload failed. Check the file format and try again.');const sound:Sound=await response.json();setSounds(s=>[...s,sound]);setPreferences(p=>({...p,kind:`upload:${sound.id}`}));}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const controls=<details className="focus-sound-settings"><summary>Finish sound</summary><label>Alert sound<select value={preferences.kind} onChange={e=>setPreferences({...preferences,kind:e.target.value})}><option value="chime">Gentle chime</option><option value="bell">Bell</option><option value="beep">Three beeps</option><option value="silent">Silent</option>{sounds.map(s=><option key={s.id} value={`upload:${s.id}`}>{s.name}</option>)}</select></label><label>Alert volume<input type="range" min={0} max={1} step={.05} value={preferences.volume} onChange={e=>setPreferences({...preferences,volume:Number(e.target.value)})}/></label><div className="meeting-actions"><button type="button" className="button" disabled={busy} onClick={()=>void play()}>Test sound</button><button type="button" className="text-button" onClick={()=>audio().stop()}>Stop sound</button></div><label>Upload your sound<input aria-label="Upload focus alert sound" type="file" accept=".mp3,.wav,.ogg,.flac,.m4a,.webm" disabled={busy} onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/></label><p className="view-footnote">Plays when focus or break time finishes. Uploaded alerts play for up to 8 seconds. Keep this tab open; sleeping devices and muted browsers may delay or silence alerts.</p>{error&&<p role="alert" className="form-error">{error}</p>}</details>;
 return {arm,play,controls};
}
