import {describe,it,expect} from 'vitest';
import {nextPlayable,playerError,embedUrl} from './youtubeQueue';
import {youtubePlaylistId} from './youtube';
describe('YouTube queue and identification',()=>{
 it('advances past failed entries and stops at the end without repeat',()=>{expect(nextPlayable(0,4,new Set([1,2]),false)).toBe(3);expect(nextPlayable(3,4,new Set(),false)).toBeNull()});
 it('loops playable entries but terminates an entirely blocked queue',()=>{expect(nextPlayable(2,3,new Set([0]),true)).toBe(1);expect(nextPlayable(1,3,new Set([0,1,2]),true)).toBeNull()});
 it('supports a single-video repeat and empty queues',()=>{expect(nextPlayable(0,1,new Set(),true)).toBe(0);expect(nextPlayable(0,0,new Set(),true)).toBeNull()});
 it('skips content failures but never skips an identification failure',()=>{for(const code of [100,101,150])expect(playerError(code).skip).toBe(true);expect(playerError(153).skip).toBe(false);expect(playerError(153).message).toContain('referrer')});
 it('encodes the exact current origin in the iframe URL',()=>{const url=new URL(embedUrl('abcdefghijk','http://localhost:8080'));expect(url.searchParams.get('origin')).toBe('http://localhost:8080');expect(url.searchParams.get('enablejsapi')).toBe('1');expect(()=>embedUrl('invalid','file:///app')).toThrow()});
 it('accepts playlists only from YouTube and valid ID characters',()=>{expect(youtubePlaylistId('https://www.youtube.com/watch?v=abcdefghijk&list=PL123_test')).toBe('PL123_test');expect(youtubePlaylistId('https://youtube.com.evil.test/playlist?list=PL123')).toBeNull();expect(youtubePlaylistId('javascript:PL123')).toBeNull()});
});
