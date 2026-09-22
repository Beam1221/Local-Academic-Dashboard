import {applyInterface,readInterface} from "../lib/interfaceTheme";
import { InterfaceStyle } from "./InterfaceStyle";
import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { request } from '../lib/api';

type Asset = { id: number; name: string; content_type: string; url: string };
type Preferences = { background: string; motion: boolean; dim: number };
const defaults: Preferences = { background: 'plain', motion: true, dim: 65 };
const presets = [{ id: 'plain', name: 'Original' }, { id: 'aurora', name: 'Aurora' }, { id: 'midnight', name: 'Midnight' }, { id: 'grid', name: 'Study grid' }];
const mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
function readPreferences(): Preferences {
  try { const value = JSON.parse(localStorage.getItem('studyspace-appearance') || 'null'); return value && typeof value.background === 'string' ? { background: value.background, motion: value.motion !== false, dim: typeof value.dim === 'number' ? Math.max(30, Math.min(90, value.dim)) : 65 } : defaults; } catch { return defaults; }
}
export function Appearance({ open, onClose, mode, onMode }: { open: boolean; onClose: () => void; mode: string; onMode: (mode: "dark" | "light" | "system") => void }) {
  useEffect(() => { const apply=()=>applyInterface(readInterface());apply();const observer=new MutationObserver(apply);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return()=>observer.disconnect(); }, []);
  const [preferences, setPreferences] = useState(readPreferences);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const backdrop = useRef<HTMLDivElement>(null); const video = useRef<HTMLVideoElement>(null); const still = useRef<HTMLCanvasElement>(null);
  const asset = assets.find(item => `upload:${item.id}` === preferences.background);
  const url = asset?.url ?? '';
  const animate = preferences.motion && !reduced;
  useEffect(() => { void request<Asset[]>('/backgrounds').then(setAssets).catch(err => setError(err.message)); }, [open]);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setReduced(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = animate ? 'on' : 'off';
    try { localStorage.setItem('studyspace-appearance', JSON.stringify(preferences)); } catch { setError('Settings work for this visit, but browser storage is unavailable.'); }
  }, [preferences, animate]);
  useEffect(() => { if (video.current) { if (animate) void video.current.play().catch(() => {}); else video.current.pause(); } }, [animate, url]);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const move = (event: PointerEvent) => { if (event.pointerType !== 'mouse') return; cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { backdrop.current?.style.setProperty('--pointer-x', `${event.clientX / window.innerWidth * 100}%`); backdrop.current?.style.setProperty('--pointer-y', `${event.clientY / window.innerHeight * 100}%`); }); };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame); };
  }, [animate]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      for (const file of Array.from(files)) {
        if (!mimeTypes.includes(file.type)) throw new Error('Choose JPG, PNG, WebP, GIF, MP4, or WebM files.');
        if (file.size > 25 * 1024 * 1024) throw new Error('Each background must be 25 MB or smaller.');
      }
      for (const file of Array.from(files)) {
        const response = await fetch('/api/backgrounds', { method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file, signal: AbortSignal.timeout(60000) });
        if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.detail || 'Upload failed. Please try again.'); }
        const item: Asset = await response.json();
        setAssets(previous => [...previous, item]);
        setPreferences(previous => ({ ...previous, background: `upload:${item.id}` }));
      }
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: number) {
    setBusy(true);
    try { await request(`/backgrounds/${id}`, 'DELETE'); setAssets(previous => previous.filter(item => item.id !== id)); if (preferences.background === `upload:${id}`) setPreferences({ ...preferences, background: 'plain' }); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const preset = presets.some(item => item.id === preferences.background) ? preferences.background : 'plain';
  return <><div ref={backdrop} className={`workspace-background background-${preset}`} aria-hidden="true">
    {url && asset && (asset.content_type.startsWith('video/') ? <video ref={video} src={url} muted loop playsInline autoPlay={animate} onError={() => setError('This browser cannot play that video. Try an MP4 (H.264) or WebM file.')} /> : <><img src={url} alt="" style={{ visibility: animate ? 'visible' : 'hidden' }} onError={() => setError('This image could not be displayed. Try another file.')} onLoad={event => { const image = event.currentTarget; const canvas = still.current; if (canvas) { const scale = Math.min(1, 1920 / image.naturalWidth); canvas.width = image.naturalWidth * scale; canvas.height = image.naturalHeight * scale; canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height); } }}/><canvas ref={still} style={{ visibility: animate ? 'hidden' : 'visible' }}/></>)}
    <div className="background-shade" style={{ opacity: preferences.dim / 100 }}/>
  </div>{open && <Modal title="Make it your space" onClose={onClose} wide><div className="form-stack"><InterfaceStyle mode={mode} onMode={onMode}/><div><h3>Background</h3><p className="view-footnote">Your theme, with a different atmosphere. Uploads are saved with your coursework; your selection is personal to this browser.</p></div><div className="background-options">{presets.map(item => <button key={item.id} className={`background-option ${preferences.background === (typeof item.id === 'number' ? `upload:${item.id}` : item.id) ? 'selected' : ''}`} aria-pressed={preferences.background === (typeof item.id === 'number' ? `upload:${item.id}` : item.id)} onClick={() => setPreferences({ ...preferences, background: item.id })}><span className={`background-swatch background-${item.id}`}/><span>{item.name}</span>{preferences.background === (typeof item.id === 'number' ? `upload:${item.id}` : item.id) && <Check size={16}/>}</button>)}</div>
      <label className="upload-background"><ImagePlus size={22}/><strong>{busy ? 'Saving background…' : 'Upload pictures or animations'}</strong><span>JPG, PNG, WebP, GIF, MP4, WebM · up to 25 MB each</span><input type="file" accept={mimeTypes.join(',')} multiple disabled={busy} onChange={e => { void upload(e.target.files); e.target.value = ''; }}/></label>
      {assets.length > 0 && <div className="uploaded-backgrounds">{assets.map(item => <div key={item.id}><button className="text-button" aria-pressed={preferences.background === (typeof item.id === 'number' ? `upload:${item.id}` : item.id)} onClick={() => setPreferences({ ...preferences, background: `upload:${item.id}` })}>{preferences.background === (typeof item.id === 'number' ? `upload:${item.id}` : item.id) && <Check size={16}/>} {item.name}</button><button className="icon-button" disabled={busy} aria-label={`Remove ${item.name}`} onClick={() => void remove(item.id)}><Trash2 size={16}/></button></div>)}</div>}
      <label>Background dimming · {preferences.dim}%<input type="range" min={30} max={90} value={preferences.dim} onChange={e => setPreferences({ ...preferences, dim: Number(e.target.value) })}/></label><label className="checkbox-label"><input type="checkbox" checked={preferences.motion} onChange={e => setPreferences({ ...preferences, motion: e.target.checked })}/>Enable movement and interaction animations</label>{reduced && <p className="view-footnote">Your device’s reduced-motion preference is active. Animations are paused.</p>}
      {error && <p role="alert" className="form-error">{error}</p>}<button className="button primary" onClick={onClose}>Done</button>
    </div></Modal>}</>;
}
