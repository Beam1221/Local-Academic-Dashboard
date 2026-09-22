export const interfaceDefaults={palette:'violet',design:'soft',density:'comfortable',textSize:'standard',customAccent:'#b5a5ff',customTint:'#52658c'};
export type InterfacePreferences=typeof interfaceDefaults;
export function readInterface():InterfacePreferences {try{return {...interfaceDefaults,...JSON.parse(localStorage.getItem('studyspace-interface')||'{}')}}catch{return interfaceDefaults}}
function rgb(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
function hex(values:number[]){return '#'+values.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('')}
function mix(a:string,b:string,amount:number){const x=rgb(a),y=rgb(b);return hex(x.map((v,i)=>v*(1-amount)+y[i]*amount))}
function luminance(color:string){const v=rgb(color).map(n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722}
export function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
export function customColors(accent:string,tint:string,light:boolean){
 if(!/^#[0-9a-f]{6}$/i.test(accent))accent=interfaceDefaults.customAccent;
 if(!/^#[0-9a-f]{6}$/i.test(tint))tint=interfaceDefaults.customTint;
 const bg=mix(light?'#ffffff':'#090b10',tint,light?.06:.10);
 const panel=mix(light?'#ffffff':'#191c22',tint,light?.04:.17);
 let accessible=accent;for(let i=0;contrast(accessible,panel)<4.5&&i<30;i++)accessible=mix(accessible,light?'#000000':'#ffffff',.12);
 return {'--bg':bg,'--panel':panel,'--sidebar':mix(bg,tint,.06),'--elevated':mix(panel,tint,.12),'--border':mix(panel,light?'#000000':'#ffffff',.23),'--accent':accessible,'--accent-soft':mix(panel,accessible,.14)};
}
export function applyInterface(style:InterfacePreferences){const root=document.documentElement;root.dataset.palette=style.palette;root.dataset.design=style.design;root.dataset.density=style.density;root.dataset.textSize=style.textSize;const colors=customColors(style.customAccent,style.customTint,root.dataset.theme==='light');for(const [key,value] of Object.entries(colors)){if(style.palette==='custom')root.style.setProperty(key,value);else root.style.removeProperty(key)}}
