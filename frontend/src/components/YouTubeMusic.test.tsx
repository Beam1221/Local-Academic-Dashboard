// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {YouTubeMusic} from './YouTubeMusic';

const videos=[{id:'abcdefghijk',title:'First song'},{id:'ABCDEFGHIJK',title:'Second song'},{id:'12345678901',title:'Third song'}];
type EventHandlers={onReady:(e:unknown)=>void;onError:(e:unknown)=>void;onStateChange:(e:unknown)=>void;onAutoplayBlocked:()=>void};
let instances:FakePlayer[]=[];
class FakePlayer {
 id='';events:EventHandlers;frame:HTMLIFrameElement;
 loadVideoById=vi.fn((id:string)=>{this.id=id});pauseVideo=vi.fn();destroy=vi.fn();getVideoData=()=>({video_id:this.id});
 constructor(frame:HTMLIFrameElement,options:{events:EventHandlers}){this.frame=frame;this.events=options.events;instances.push(this)}
 event(kind:'onError'|'onStateChange',data:number){this.events[kind]({data,target:this})}
}
beforeEach(()=>{
 instances=[];localStorage.clear();
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 window.YT={Player:FakePlayer} as unknown as typeof window.YT;
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>({ok:true,status:200,json:async()=>input.includes('/search?')?videos:input.includes('/playlist-items/')?(input.includes('page_token=next')?{items:[videos[2]],next_page:''}:{items:videos.slice(0,2),next_page:'next'}):{connected:false}})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();delete window.YT});
async function start(){
 render(<YouTubeMusic active/>);
 fireEvent.change(screen.getByLabelText('Search YouTube'),{target:{value:'songs'}});
 fireEvent.click(screen.getByRole('button',{name:'Search YouTube'}));
 fireEvent.click(await screen.findByRole('button',{name:/First song/}));
 await waitFor(()=>expect(instances).toHaveLength(1));
 await act(async()=>instances[0].events.onReady({target:instances[0]}));
 return instances[0];
}
describe('YouTube player runtime',()=>{
 it('sets iframe identification before constructing the API player and retains it when hidden',async()=>{
  const player=await start();expect(player.frame.referrerPolicy).toBe('strict-origin-when-cross-origin');expect(player.frame.allow).toContain('autoplay');expect(new URL(player.frame.src).searchParams.get('origin')).toBe(location.origin);
  fireEvent.click(screen.getByLabelText('Hide player without stopping'));expect(document.querySelector('iframe')).toBe(player.frame);expect(player.destroy).not.toHaveBeenCalled();expect(player.pauseVideo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'♫ Show player'}));expect(document.querySelector('iframe')).toBe(player.frame);
 });
 it('automatically plays the next result on ended without recreating the player',async()=>{
  const player=await start();act(()=>{player.event('onStateChange',1);player.event('onStateChange',0)});
  await waitFor(()=>expect(player.loadVideoById).toHaveBeenLastCalledWith(videos[1].id));expect(instances).toHaveLength(1);expect(screen.getByLabelText('YouTube mini-player').textContent).toContain('Second song');
 });
 it('skips 100/101/150 and stops when every result failed instead of looping forever',async()=>{
  const player=await start();
  for(const [i,code] of [100,101,150].entries()){
   act(()=>player.event('onError',code));
   if(i<2)await waitFor(()=>expect(player.loadVideoById).toHaveBeenLastCalledWith(videos[i+1].id));
  }
  expect(await screen.findByText(/No more playable videos/)).toBeTruthy();expect(player.loadVideoById).toHaveBeenCalledTimes(3);expect(screen.getByRole('link',{name:'Open on YouTube'})).toBeTruthy();
 });
 it('does not advance on error 153, and reports blocked autoplay',async()=>{
  const player=await start();act(()=>{player.event('onError',153);player.event('onStateChange',0)});
  expect(screen.getByText(/could not identify this app/)).toBeTruthy();expect(player.loadVideoById).toHaveBeenCalledTimes(1);
  act(()=>player.events.onAutoplayBlocked());expect(screen.getByText(/browser blocked autoplay/)).toBeTruthy();
 });
 it('imports every playlist page in order before playback',async()=>{
  render(<YouTubeMusic active/>);fireEvent.change(screen.getByLabelText('Import YouTube playlist'),{target:{value:'https://www.youtube.com/playlist?list=PLtest'}});fireEvent.click(screen.getByRole('button',{name:'Import & play all'}));
  await waitFor(()=>expect(instances).toHaveLength(1));expect(screen.getByText('1 / 3')).toBeTruthy();
  await act(async()=>instances[0].events.onReady({target:instances[0]}));expect(instances[0].loadVideoById).toHaveBeenLastCalledWith(videos[0].id);
 });
});
