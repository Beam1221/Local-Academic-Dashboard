export type Position={x:number;y:number};
export function clampPosition(p:Position,width:number,height:number,viewportWidth:number,viewportHeight:number):Position{
 return {x:Math.max(8,Math.min(Number.isFinite(p.x)?p.x:8,viewportWidth-width-8)),y:Math.max(8,Math.min(Number.isFinite(p.y)?p.y:8,viewportHeight-height-8))};
}
