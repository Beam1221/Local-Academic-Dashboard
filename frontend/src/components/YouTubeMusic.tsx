import {useEffect,useRef,useState} from 'react';
import {ExternalLink,Search} from 'lucide-react';
import {request} from '../lib/api';
import {FloatingPlayer} from './FloatingPlayer';
import {youtubeId,youtubePlaylistId} from '../lib/youtube';
import {embedUrl,nextPlayable,playerError,type Video} from '../lib/youtubeQueue';

type Player={pauseVideo:()=>void;destroy:()=>void;loadVideoById:(id:string)=>void;getVideoData:()=>{video_id?:string}};
type PlayerEvent={target:Player;data:number};
type YouTube={Player:new(element:HTMLElement,options:{playerVars:Record<string,string|number>;events:{onReady:(event:{target:Player})=>void;onStateChange:(event:PlayerEvent)=>void;onError:(event:PlayerEvent)=>void;onAutoplayBlocked:()=>void}})=>Player};
declare global {interface Window{YT?:YouTube;onYouTubeIframeAPIReady?:()=>void}}
let loader:Promise<YouTube>|undefined;
function loadYouTube():Promise<YouTube>{
 if(window.YT?.Player)return Promise.resolve(window.YT);
 if(loader)return loader;
 loader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timeout=window.setTimeout(()=>{loader=undefined;script.remove();reject(new Error('YouTube player timed out. Try again or open on YouTube.'))},15000);
  window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve(window.YT!)};
  script.src='https://www.youtube.com/iframe_api';
  script.onerror=()=>{clearTimeout(timeout);loader=undefined;script.remove();reject(new Error('YouTube could not load. Check your connection.'))};
  document.head.append(script);
 });return loader;
}
type Playlist={id:string;title:string;count:number};
type Page<T>={items:T[];next_page:string};

export function YouTubeMusic({active}:{active:boolean}){
 const [query,setQuery]=useState('');const [link,setLink]=useState('');const [results,setResults]=useState<Video[]>([]);
 const [queue,setQueue]=useState<Video[]>([]);const [index,setIndex]=useState(0);const [opened,setOpened]=useState(false);
 const [error,setError]=useState('');const [playError,setPlayError]=useState('');const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);const [ready,setReady]=useState(false);const [repeat,setRepeat]=useState(true);
 const [playlistLink,setPlaylistLink]=useState('');const [playlists,setPlaylists]=useState<Playlist[]>([]);const [nextPage,setNextPage]=useState('');
 const [connected,setConnected]=useState(false);const [importing,setImporting]=useState(false);const [importProgress,setImportProgress]=useState(0);
 const mount=useRef<HTMLDivElement>(null);const player=useRef<Player|undefined>(undefined);
 const queueRef=useRef(queue);const indexRef=useRef(index);const repeatRef=useRef(repeat);repeatRef.current=repeat;
 const failed=useRef(new Set<number>());const transition=useRef(false);const readyRef=useRef(false);
 const searchId=useRef(0);const importId=useRef(0);const nextFrame=useRef<number|undefined>(undefined);
 const selected=opened?queue[index]:undefined;
 useEffect(()=>{if(active)void request<{connected:boolean}>('/youtube/account/settings').then(x=>setConnected(x.connected)).catch(()=>setConnected(false))},[active]);
 useEffect(()=>()=>{++searchId.current;++importId.current},[]);

 function loadAt(next:number){
  indexRef.current=next;setIndex(next);setPlayError('');transition.current=true;
  if(readyRef.current)player.current?.loadVideoById(queueRef.current[next].id);
 }
 function begin(items:Video[],from=0){
  if(!items.length){setError('No available videos were found in this playlist.');return;}
  ++importId.current;setImporting(false);clearTimeout(nextFrame.current);failed.current.clear();queueRef.current=items;setQueue(items);setNotice('');setOpened(true);loadAt(from);
 }
 function advance(reason:'ended'|'error'|'manual'){
  const next=nextPlayable(indexRef.current,queueRef.current.length,failed.current,repeatRef.current);
  if(next===null){transition.current=false;setPlayError(reason==='error'?'No more playable videos in this queue. Try another playlist or Open on YouTube.':'');setNotice(reason==='error'?'':'Queue finished. Select a video or enable Repeat queue.');return;}
  loadAt(next);
 }
 function later(reason:'ended'|'error'){
  if(transition.current)return;
  transition.current=true;
  nextFrame.current=window.setTimeout(()=>advance(reason),100);
 }
 const handlers=useRef({advance,later});handlers.current={advance,later};
 const isOpen=Boolean(selected);
 useEffect(()=>{
  if(!isOpen)return;
  let cancelled=false;setReady(false);readyRef.current=false;setPlayError('');
  // Apply client identification before the first iframe request, not in onReady.
  const frame=document.createElement('iframe');
  frame.title='YouTube video player';frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';frame.allowFullscreen=true;
  frame.setAttribute('frameborder','0');frame.height='220';frame.width='100%';
  frame.src=embedUrl(queueRef.current[indexRef.current].id,window.location.origin);mount.current!.append(frame);
  const timeout=window.setTimeout(()=>{if(!cancelled)setPlayError('YouTube did not respond. Check your connection or open this video on YouTube.')},20000);
  const currentEvent=(event:PlayerEvent)=>{const id=event.target.getVideoData?.().video_id;return !id||id===queueRef.current[indexRef.current]?.id};
  void loadYouTube().then(YT=>{
   if(cancelled)return;
   player.current=new YT.Player(frame,{playerVars:{origin:window.location.origin,playsinline:1},events:{
    onReady:({target})=>{if(cancelled)return;clearTimeout(timeout);setPlayError('');setReady(true);readyRef.current=true;transition.current=false;target.loadVideoById(queueRef.current[indexRef.current].id)},
    onStateChange:event=>{
     if(cancelled||!currentEvent(event))return;
     if([-1,1,3,5].includes(event.data))transition.current=false;
     if(event.data===1){setNotice('');setPlayError('');window.dispatchEvent(new Event('studyspace-youtube-playing'));}
     if(event.data===0)handlers.current.later('ended');
    },
    onError:event=>{
     if(cancelled||!currentEvent(event))return;
     clearTimeout(timeout);console.warn('YouTube player error:',event.data);
     const problem=playerError(event.data);setPlayError(problem.message);
     if(!problem.skip)transition.current=true;
     if(problem.skip&&!failed.current.has(indexRef.current)){
      failed.current.add(indexRef.current);setNotice('Skipping an unavailable video…');transition.current=false;handlers.current.later('error');
     }
    },
    onAutoplayBlocked:()=>{if(!cancelled){transition.current=false;setNotice('Your browser blocked autoplay. Press Play inside the video to continue this queue.')}},
   }});
  }).catch(e=>{if(!cancelled)setPlayError(e.message)});
  const pause=()=>{clearTimeout(nextFrame.current);player.current?.pauseVideo()};window.addEventListener('studyspace-audio-playing',pause);
  return()=>{cancelled=true;clearTimeout(timeout);clearTimeout(nextFrame.current);window.removeEventListener('studyspace-audio-playing',pause);readyRef.current=false;player.current?.destroy();player.current=undefined;frame.remove()};
 },[isOpen]);

 async function search(){const id=++searchId.current;setBusy(true);setError('');try{const items=await request<Video[]>(`/music/youtube/search?q=${encodeURIComponent(query.trim())}`);if(id===searchId.current){setResults(items);if(!items.length)setError('No embeddable videos found. Try another search.')}}catch(e){if(id===searchId.current)setError((e as Error).message)}finally{if(id===searchId.current)setBusy(false)}}
 async function myPlaylists(page=''){
  setBusy(true);setError('');try{const data=await request<Page<Playlist>>(`/youtube/account/playlists?page_token=${encodeURIComponent(page)}`);setPlaylists(old=>page?[...old,...data.items]:data.items);setNextPage(data.next_page);if(!data.items.length&&!page)setError('No playlists were returned for this account. You can also paste a public playlist link.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function importPlaylist(id:string,personal=connected){
  const token=++importId.current;setImporting(true);setImportProgress(0);setError('');let page='';const videos:Video[]=[];const seen=new Set<string>();
  try{do{
   if(seen.has(page))throw new Error('YouTube repeated a playlist page. Please try again.');seen.add(page);
   const data=await request<Page<Video>>(`/youtube/playlist-items/${encodeURIComponent(id)}?personal=${personal}&page_token=${encodeURIComponent(page)}`);
   if(token!==importId.current)return;videos.push(...data.items);setImportProgress(videos.length);page=data.next_page;
   if(seen.size>=100&&page)throw new Error('This playlist exceeds 5,000 entries. Use a smaller playlist.');
  }while(page);begin(videos);}catch(e){if(token===importId.current)setError((e as Error).message)}finally{if(token===importId.current)setImporting(false)}
 }
 function close(){clearTimeout(nextFrame.current);setOpened(false);setNotice('');setPlayError('');}
 return <><section hidden={!active} className="youtube-search-panel"><h3>YouTube music & study videos</h3><p className="view-footnote">Select a result to play that song and the following results. Unavailable videos are skipped. Playback continues across workspace pages; browser and YouTube restrictions can still apply.</p>
  <form className="music-search" onSubmit={e=>{e.preventDefault();void search()}}><Search size={18}/><input aria-label="Search YouTube" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search songs, artists, or study mixes…"/><button className="button" disabled={busy||!query.trim()}>{busy?'Searching…':'Search YouTube'}</button></form>
  <form className="music-search" onSubmit={e=>{e.preventDefault();const list=youtubePlaylistId(link);const id=youtubeId(link);if(list){void importPlaylist(list)}else if(id){begin([{id,title:'YouTube video'}]);setError('')}else setError('Paste a valid YouTube video or playlist link.')}}><input aria-label="YouTube video link" value={link} onChange={e=>setLink(e.target.value)} placeholder="Paste a YouTube video or playlist link"/><button className="button" disabled={!link.trim()||importing}>Open player</button><button className="button" type="button" disabled={!youtubeId(link)} onClick={()=>{const id=youtubeId(link)!;if(!opened)begin([{id,title:'YouTube video'}]);else{const next=[...queueRef.current,{id,title:'YouTube video'}];queueRef.current=next;setQueue(next);setNotice('Video added to queue.')}}}>Add to queue</button></form>
  <div className="settings-links"><a className="button" href="#settings">YouTube account & API settings</a><button className="button" disabled={busy||!connected} onClick={()=>void myPlaylists()}>My playlists</button><label className="youtube-repeat"><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/>Repeat queue</label></div>
  <form className="music-search" onSubmit={e=>{e.preventDefault();const id=youtubePlaylistId(playlistLink);if(id)void importPlaylist(id);else setError('Paste a valid YouTube playlist URL or playlist ID.')}}><input aria-label="Import YouTube playlist" value={playlistLink} onChange={e=>setPlaylistLink(e.target.value)} placeholder="Import a playlist link or ID…"/><button className="button" disabled={!playlistLink.trim()||importing}>Import & play all</button></form>
  {importing&&<p role="status">Importing playlist… {importProgress} videos <button className="button" onClick={()=>{++importId.current;setImporting(false)}}>Cancel</button></p>}
  {playlists.length>0&&<div className="youtube-results">{playlists.map(list=><button className="panel youtube-result" key={list.id} disabled={importing} onClick={()=>void importPlaylist(list.id,true)}><strong>{list.title}</strong><small>{list.count} videos · Play all</small></button>)}</div>}{nextPage&&<button className="button" disabled={busy} onClick={()=>void myPlaylists(nextPage)}>More playlists</button>}
  {error&&<p role="alert" className="form-error">{error}</p>}<div className="youtube-results">{results.map((video,i)=><button className="panel youtube-result" key={video.id} onClick={()=>begin(results,i)}><span className="youtube-badge">▶ YouTube</span><strong>{video.title}</strong><small>{video.channel}</small><span>Play from here →</span></button>)}</div>
 </section>{selected&&<FloatingPlayer onPause={()=>{clearTimeout(nextFrame.current);player.current?.pauseVideo()}} title={selected.title} onClose={close}>
  <div ref={mount} className="youtube-embed"/>
  <div className="youtube-queue-controls"><span>{index+1} / {queue.length}</span><button disabled={!ready} onClick={()=>{clearTimeout(nextFrame.current);failed.current.delete(indexRef.current);player.current?.loadVideoById(queueRef.current[indexRef.current].id)}}>Play / retry</button><button disabled={!ready||queue.length<2} onClick={()=>{clearTimeout(nextFrame.current);advance('manual')}}>Next →</button></div>
  {!ready&&!playError&&<p role="status">Loading YouTube…</p>}{notice&&<p role="status">{notice}</p>}{playError&&<p role="alert">{playError}</p>}<a href={`https://www.youtube.com/watch?v=${selected.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>Open on YouTube</a>
 </FloatingPlayer>}</>;
}
