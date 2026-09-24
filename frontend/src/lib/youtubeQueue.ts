export type Video = {id:string;title:string;channel?:string};
export function nextPlayable(index:number, length:number, failed:Set<number>, repeat:boolean):number|null {
  for(let step=1;step<=length;step++) {
    const next=index+step;
    if(!repeat&&next>=length)return null;
    const candidate=next%length;
    if(!failed.has(candidate))return candidate;
  }
  return null;
}
export function playerError(code:number):{skip:boolean;message:string} {
  const messages:Record<number,string>={
    2:'YouTube rejected this video ID.',
    5:'YouTube could not decode this video. Try Play again or open it on YouTube.',
    100:'This video was removed or is private.',
    101:'The owner disabled embedded playback.',
    150:'The owner disabled embedded playback.',
    153:'YouTube could not identify this app (153). Check that your browser/proxy sends the origin referrer; disable referrer stripping for this site, or open on YouTube.',
  };
  return {skip:[100,101,150].includes(code),message:messages[code]||`YouTube playback error ${code}. Try another video or open on YouTube.`};
}
export function embedUrl(id:string,origin:string):string {
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))throw new Error('Invalid YouTube video ID');
  const base=new URL(origin);
  if(!['https:','http:'].includes(base.protocol))throw new Error('YouTube requires an HTTP(S) application origin');
  return `https://www.youtube.com/embed/${id}?${new URLSearchParams({enablejsapi:'1',origin:base.origin,playsinline:'1',autoplay:'0'})}`;
}
