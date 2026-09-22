import {describe,it,expect} from 'vitest';
import {clampPosition} from './playerPosition';
describe('mini-player viewport bounds',()=>{
 it('keeps dragged players and stale saved positions reachable',()=>{expect(clampPosition({x:-90,y:9999},360,330,1200,800)).toEqual({x:8,y:462})});
 it('handles small screens and invalid coordinates',()=>{expect(clampPosition({x:NaN,y:Infinity},560,500,320,240)).toEqual({x:8,y:8})});
 it('preserves valid positions',()=>{expect(clampPosition({x:70,y:85},360,330,1200,800)).toEqual({x:70,y:85})});
});
