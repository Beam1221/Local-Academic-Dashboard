export function youtubeId(input:string):string|null {
 const value=input.trim();if(/^[A-Za-z0-9_-]{11}$/.test(value))return value;
 try {const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return null;
 const host=url.hostname.toLowerCase();let id:string|null=null;
 if(host==='youtu.be')id=url.pathname.split('/')[1];
 else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)){const parts=url.pathname.split('/');id=url.pathname==='/watch'?url.searchParams.get('v'):['embed','shorts','live'].includes(parts[1])?parts[2]:null;}
 return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;}catch{return null;}
}
