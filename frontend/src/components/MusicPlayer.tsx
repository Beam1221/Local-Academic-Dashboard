import {YouTubeMusic} from "./YouTubeMusic";
import { useEffect, useRef, useState } from 'react';
import { Headphones, Heart, Music2, Pause, Play, Radio, Repeat, Search, Shuffle, SkipBack, SkipForward, Trash2, Upload, Volume2, X } from 'lucide-react';
import { request } from '../lib/api';

type Track = { id: string; name: string; url: string; source: 'local' | 'radio'; subtitle: string };
type Local = { id: number; name: string; url: string };
type Station = { id: string; name: string; url: string; country: string; tags: string };
const genres = ['pop', 'rock', 'hip hop', 'rnb', 'electronic', 'dance', 'arabic', 'african', 'reggae', 'jazz', 'ambient', 'classical', 'lofi', 'chillout'];
const fileTypes: Record<string,string> = {mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac',m4a:'audio/mp4',webm:'audio/webm'};
function stored<T>(key:string, fallback:T):T { try { return JSON.parse(localStorage.getItem(key)||'null') ?? fallback; } catch {return fallback;} }
function stamp(seconds:number) { return Number.isFinite(seconds) ? `${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}` : 'Live'; }

export function MusicPlayer({active,onOpen}:{active:boolean;onOpen:()=>void}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [library,setLibrary] = useState<Track[]>([]);
  const [stations,setStations] = useState<Track[]>([]);
  const [source,setSource] = useState<'local'|'radio'|'liked'|'youtube'>('local');
  const [query,setQuery] = useState('');
  const [genre,setGenre] = useState('');
  const [country,setCountry] = useState('');
  const [favorites,setFavorites] = useState<Track[]>(()=>stored('studyspace-music-favorites',[]));
  const [current,setCurrent] = useState<Track>();
  const [queue,setQueue] = useState<Track[]>([]);
  const [playing,setPlaying] = useState(false);
  const [shuffle,setShuffle] = useState(false);
  const [repeat,setRepeat] = useState(false);
  const [volume,setVolume] = useState(()=>Math.max(0,Math.min(1,Number(stored('studyspace-music-volume',0.5))||0)));
  const [position,setPosition] = useState(0);
  const [duration,setDuration] = useState(0);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [searching,setSearching] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const searchId = useRef(0);
  const playId = useRef(0);

  useEffect(()=>{ if(active&&!loaded) {setLoaded(true); void request<Local[]>('/music').then(rows=>setLibrary(rows.map(t=>({...t,id:`local:${t.id}`,source:'local',subtitle:'Your library'})))).catch(e=>{setError(e.message)});} },[active,loaded]);
  useEffect(()=>{if(audio.current)audio.current.volume=volume;try{localStorage.setItem('studyspace-music-volume',JSON.stringify(volume))}catch{/* Session-only */}},[volume]);
  useEffect(()=>{try{localStorage.setItem('studyspace-music-favorites',JSON.stringify(favorites))}catch{/* Session-only */}},[favorites]);
  useEffect(()=>{const pause=()=>audio.current?.pause();window.addEventListener('studyspace-youtube-playing',pause);return()=>window.removeEventListener('studyspace-youtube-playing',pause)},[]);
  useEffect(()=>{document.documentElement.dataset.music=current?'open':'closed';return()=>{delete document.documentElement.dataset.music}},[current]);
  async function play(track:Track, list=queue) {
    window.dispatchEvent(new Event('studyspace-audio-playing'));
    const token=++playId.current;
    setCurrent(track);setQueue(list);setError('');setPosition(0);setDuration(0);
    const player=audio.current!;player.src=track.url;player.load();
    try{await player.play()}catch{if(playId.current===token)setError('Playback could not start. Try Play again, another station, or a supported audio file.');}
  }
  function advance(direction:number) {
    if(!current||!queue.length)return;
    let index=queue.findIndex(t=>t.id===current.id);
    if(shuffle&&queue.length>1)index=(index+1+Math.floor(Math.random()*(queue.length-1)))%queue.length;
    else index=(index+direction+queue.length)%queue.length;
    void play(queue[index]);
  }
  async function toggle(){if(!audio.current||!current)return;if(!audio.current.paused)audio.current.pause();else try{window.dispatchEvent(new Event("studyspace-audio-playing"));await audio.current.play()}catch{setError('Unable to play this source. Try another track.')}}
  function like(t:Track){setFavorites(prev=>prev.some(x=>x.id===t.id)?prev.filter(x=>x.id!==t.id):[...prev,t])}
  async function searchRadio(nextGenre=genre,nextCountry=country,nextQuery=query) {
    const token=++searchId.current;setSearching(true);setError('');setSource('radio');
    try{const rows=await request<Station[]>(`/music/radio/search?q=${encodeURIComponent(nextQuery)}&genre=${encodeURIComponent(nextGenre)}&country=${encodeURIComponent(nextCountry)}`);if(token===searchId.current)setStations(rows.map(t=>({...t,id:`radio:${t.id}`,source:'radio',subtitle:[t.country,t.tags.split(',').slice(0,2).join(' · ')].filter(Boolean).join(' · ')})));}
    catch(e){if(token===searchId.current)setError((e as Error).message)}finally{if(token===searchId.current)setSearching(false)}
  }
  async function upload(files:File[]) {
    setBusy(true);setError('');
    try {for(const file of files){
      const type=fileTypes[file.name.split('.').pop()?.toLowerCase()||''];
      if(!type||file.size>100*1024*1024)throw new Error('Choose MP3, WAV, Ogg, FLAC, M4A or WebM files up to 100 MB each.');
      const response=await fetch('/api/music',{method:'POST',headers:{'Content-Type':type,'X-File-Name':encodeURIComponent(file.name)},body:file,signal:AbortSignal.timeout(120000)});
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.detail||'Upload failed.');}
      const item:Local=await response.json();setLibrary(prev=>[...prev,{...item,id:`local:${item.id}`,source:'local',subtitle:'Your library'}]);
    }setSource('local');setQuery('');}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function remove(t:Track) {
    if(!confirm(`Remove “${t.name}” from your uploaded library?`))return;
    try{await request(`/music/${t.id.split(':')[1]}`,'DELETE');setLibrary(prev=>prev.filter(x=>x.id!==t.id));setFavorites(prev=>prev.filter(x=>x.id!==t.id));setQueue(prev=>prev.filter(x=>x.id!==t.id));if(current?.id===t.id){audio.current?.pause();setCurrent(undefined)}}catch(e){setError((e as Error).message)}
  }
  const rows=(source==='local'?library:source==='liked'?favorites:stations).filter(t=>source==='radio'||`${t.name} ${t.subtitle}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <audio ref={audio} preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onTimeUpdate={()=>setPosition(audio.current?.currentTime||0)} onLoadedMetadata={()=>setDuration(audio.current?.duration||0)} onError={()=>{setPlaying(false);setError('This source is unavailable or uses a codec your browser cannot play. Try another track or station.')}} onEnded={()=>{if(repeat&&current?.source==='local'&&audio.current){audio.current.currentTime=0;void toggle()}else if(current&&(shuffle||queue.findIndex(t=>t.id===current.id)<queue.length-1))advance(1);else setPlaying(false)}}/>
    <section className="music-library" hidden={!active}>
      <div className="music-hero"><div><span className="music-kicker"><Headphones size={16}/>SOUNDTRACK YOUR STUDY</span><h2>Find your focus.</h2><p>Your songs. Every genre. Space to concentrate.</p><div className="music-hero-actions"><label className="button primary"><Upload size={17}/>{busy?'Uploading…':'Upload music'}<input aria-label="Upload music files" type="file" multiple accept=".mp3,.wav,.ogg,.flac,.m4a,.webm" disabled={busy} onChange={e=>{void upload(Array.from(e.target.files||[]));e.target.value=''}} hidden/></label><button className="button" onClick={()=>void searchRadio()}>Discover radio</button><button className="button" onClick={()=>{setCountry("ET");setGenre("");setQuery("");void searchRadio("","ET","")}}>🇪🇹 Ethiopian radio</button></div></div><div className="music-art" aria-hidden="true"><div className="vinyl"><div/></div></div></div>
      <div className="music-tabs" role="group" aria-label="Music sources"><button aria-pressed={source==='local'} onClick={()=>{setSource('local');setQuery('')}}><Music2 size={17}/>Your library <small>{library.length}</small></button><button aria-pressed={source==='liked'} onClick={()=>{setSource('liked');setQuery('')}}><Heart size={17}/>Liked</button><button aria-pressed={source==='radio'} onClick={()=>{setSource('radio');if(!stations.length)void searchRadio()}}><Radio size={17}/>Online radio</button><button aria-pressed={source==='youtube'} onClick={()=>setSource('youtube')}>▶ YouTube</button></div>
      {source!=='youtube'&&<form className="music-search" onSubmit={e=>{e.preventDefault();if(source==='radio')void searchRadio()}}><Search size={19}/><input aria-label="Search music" placeholder={source==='radio'?'Search station names…':'Search your songs…'} value={query} onChange={e=>setQuery(e.target.value)}/>{source==='radio'&&<><select aria-label="Radio country" value={country} onChange={e=>{setCountry(e.target.value);void searchRadio(genre,e.target.value)}}><option value="">Worldwide</option><option value="ET">Ethiopia</option></select><select aria-label="Radio genre" value={genre} onChange={e=>setGenre(e.target.value)}><option value="">All genres</option>{genres.map(g=><option key={g}>{g}</option>)}</select><button className="button" disabled={searching}>Search</button></>}</form>}
      {source==='radio'&&<>{country==='ET'&&<div className="ethiopian-radio-heading"><h3>🇪🇹 Ethiopian radio</h3><p className="view-footnote">Browse available Ethiopian stations in the live directory. Use All genres for the widest selection; tap a heart to save favorites. Listings may be incomplete, and some stations may be offline or lack a supported secure stream.</p><span>{searching?'Updating directory…':`${stations.length} stations found`}</span></div>}<div className="music-genres">{genres.map(g=><button key={g} aria-pressed={genre===g} onClick={()=>{setGenre(g);void searchRadio(g)}}>{g}</button>)}</div><p className="view-footnote">Live stations from <a href="https://www.radio-browser.info/" target="_blank" rel="noreferrer">Radio Browser</a>. Search is for stations; uploaded songs are searchable in Your library. Streaming connects directly to the station and needs internet access.</p></>}
      {error&&<p className="form-error" role="alert">{error}</p>}{searching&&<p role="status">Finding stations…</p>}
      {source!=='youtube'&&<div className="music-list"><div className="music-list-head"><span>#</span><span>{source==='radio'?'STATION':'TITLE'}</span><span>SOURCE</span><span/></div>{rows.map((t,i)=><div className={`music-row ${current?.id===t.id?'selected':''}`} key={t.id}><button className="icon-button" aria-label={`Play ${t.name}`} onClick={()=>void play(t,rows)}>{current?.id===t.id&&playing?<span className="equalizer">▂▆▃</span>:<Play size={17}/>}</button><button className="music-track-title" onClick={()=>void play(t,rows)}><span className={`track-cover cover-${i%5}`}><Music2 size={22}/></span><span><strong>{t.name}</strong><small>{t.subtitle}</small></span></button><span className="music-source-label">{t.source==='radio'?'LIVE RADIO':'LOCAL AUDIO'}</span><div className="music-row-actions"><button className="icon-button" aria-label={`${favorites.some(x=>x.id===t.id)?'Unlike':'Like'} ${t.name}`} aria-pressed={favorites.some(x=>x.id===t.id)} onClick={()=>like(t)}><Heart size={18} fill={favorites.some(x=>x.id===t.id)?'currentColor':'none'}/></button>{t.source==='local'&&<button className="icon-button" aria-label={`Remove ${t.name}`} onClick={()=>void remove(t)}><Trash2 size={16}/></button>}</div></div>)}</div>}
      {source!=='youtube'&&!rows.length&&!searching&&<div className="empty-state"><Music2 size={35}/><h3>{query?'No matches':source==='local'?'Build your study soundtrack':'Nothing here yet'}</h3><p>{source==='local'?'Upload songs from your computer, or discover an online station.':source==='liked'?'Tap a heart to save music here.':'Try another station name or genre.'}</p></div>}
      <p className="view-footnote">Uploads are stored in your Docker data volume. Favorites and volume are saved in this browser. Music keeps playing while you navigate; playback does not restart automatically after a refresh.</p>
    </section>
    <YouTubeMusic active={active&&source==='youtube'}/>
    {current&&<footer className="music-player" aria-label="Music player"><button className="now-playing" onClick={onOpen}><span className="track-cover"><Headphones size={22}/></span><span><strong>{current.name}</strong><small>{error?'Playback needs attention':current.source==='radio'?'Live radio':playing?'Now playing':'Paused'}</small></span></button><div className="music-controls"><div><button className="icon-button secondary-control" aria-label="Shuffle" aria-pressed={shuffle} onClick={()=>setShuffle(!shuffle)}><Shuffle size={17}/></button><button className="icon-button" aria-label="Previous track" disabled={queue.length<2} onClick={()=>advance(-1)}><SkipBack size={20}/></button><button className="music-play" aria-label={playing?'Pause music':'Play music'} onClick={()=>void toggle()}>{playing?<Pause size={21}/>:<Play size={21}/>}</button><button className="icon-button" aria-label="Next track" disabled={queue.length<2} onClick={()=>advance(1)}><SkipForward size={20}/></button><button className="icon-button secondary-control" aria-label="Repeat track" aria-pressed={repeat} disabled={current.source==='radio'} onClick={()=>setRepeat(!repeat)}><Repeat size={17}/></button></div><div className="music-timeline"><span>{current.source==='radio'?'LIVE':stamp(position)}</span><input aria-label="Playback position" type="range" min={0} max={Number.isFinite(duration)&&duration>0?duration:1} step={1} value={Math.min(position,Number.isFinite(duration)?duration:0)} disabled={current.source==='radio'||!Number.isFinite(duration)||!duration} onChange={e=>{if(audio.current){audio.current.currentTime=Number(e.target.value);setPosition(Number(e.target.value))}}}/><span>{current.source==='radio'?'RADIO':stamp(duration)}</span></div></div><div className="music-volume"><Volume2 size={19}/><input aria-label="Music volume" type="range" min={0} max={1} step={.01} value={volume} onChange={e=>setVolume(Number(e.target.value))}/><button className="icon-button" aria-label="Close music player" onClick={()=>{++playId.current;audio.current?.pause();if(audio.current)audio.current.removeAttribute('src');setCurrent(undefined)}}><X size={19}/></button></div></footer>}
  </>;
}
