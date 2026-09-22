import {describe,it,expect,vi,afterEach} from 'vitest';
import {youtubeId} from './youtube';
import {customColors,contrast} from './interfaceTheme';
import {FocusAudio} from './focusAudio';
afterEach(()=>vi.unstubAllGlobals());
describe('YouTube links',()=>{
 it('accepts supported video URL formats',()=>{for(const link of ['abcdefghijk','https://youtu.be/abcdefghijk?t=10','https://www.youtube.com/watch?v=abcdefghijk','https://music.youtube.com/watch?v=abcdefghijk','https://youtube.com/shorts/abcdefghijk'])expect(youtubeId(link)).toBe('abcdefghijk')});
 it('rejects unrelated hosts, scripts and playlists',()=>{for(const link of ['https://youtube.com.attacker.test/watch?v=abcdefghijk','javascript:abcdefghijk','https://youtube.com/playlist?list=abc','https://youtu.be/short'])expect(youtubeId(link)).toBeNull()});
});
describe('custom palette',()=>{
 it('keeps accent text readable for extreme user choices',()=>{for(const light of [false,true])for(const accent of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff']){const colors=customColors(accent,'#ff00ff',light);expect(contrast(colors['--accent'],colors['--panel'])).toBeGreaterThanOrEqual(4.5)}});
 it('rejects malformed color values',()=>{expect(customColors('invalid','url(bad)',false)['--accent']).toMatch(/^#[a-f0-9]{6}$/i)});
});
describe('focus sound engine',()=>{
 it('plays one three-note alert and can stop it',async()=>{const oscillators:{start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>}[]=[];class Context{currentTime=0;state='running';destination={};resume=vi.fn(async()=>{});close=vi.fn(async()=>{});createGain(){return {gain:{value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()}}createOscillator(){const node={type:'',frequency:{value:0},connect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};oscillators.push(node);return node}}vi.stubGlobal('AudioContext',Context);const sound=new FocusAudio();await sound.play('beep',.5);expect(oscillators).toHaveLength(3);expect(oscillators[0].start).toHaveBeenCalledWith(0);expect(oscillators[2].start).toHaveBeenCalledWith(.7);sound.stop();expect(oscillators[0].stop).toHaveBeenCalledTimes(2)});
 it('silent mode never opens an audio context',async()=>{const constructor=vi.fn();vi.stubGlobal('AudioContext',constructor);await new FocusAudio().play('silent',1);expect(constructor).not.toHaveBeenCalled()});
});
