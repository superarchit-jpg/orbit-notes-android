/** Deterministic collision-aware concentric layout, in world coordinates. */
export type Point={x:number;y:number};
export function radialLayout(count:number, radius=44, centerRadius=56, gap=22):Point[]{
  if(count<=0)return [];
  const points:Point[]=[];
  let placed=0,ring=0;
  while(placed<count){
    ring++;
    const r= centerRadius+radius+gap+(ring-1)*(radius*2+gap+18);
    const capacity=Math.max(1,Math.floor(2*Math.PI*r/(2*radius+gap)));
    const take=Math.min(capacity,count-placed);
    for(let i=0;i<take;i++){
      const angle=-Math.PI/2+2*Math.PI*i/take+(ring%2?0:Math.PI/take);
      points.push({x:r*Math.cos(angle),y:r*Math.sin(angle)});
    }
    placed+=take;
  }
  return points;
}
/** Place sibling subtrees in non-overlapping circular regions. */
export function overviewLayout(childCounts:number[]):{parents:Point[];children:Point[][]}{
 const count=childCounts.length;if(!count)return {parents:[],children:[]};
 const childOffsets=childCounts.map(n=>radialLayout(n,29,44,22));
 const extents=childOffsets.map(points=>Math.max(55,...points.map(p=>Math.hypot(p.x,p.y)+38)));
 const maxExtent=Math.max(...extents);
 const ringRadius=Math.max(190,(maxExtent+70)/Math.sin(Math.PI/Math.max(3,count)));
 const parents=Array.from({length:count},(_,i)=>({x:Math.cos(-Math.PI/2+i*2*Math.PI/count)*ringRadius,y:Math.sin(-Math.PI/2+i*2*Math.PI/count)*ringRadius}));
 const children=childOffsets.map((points,i)=>points.map(p=>({x:p.x+parents[i].x,y:p.y+parents[i].y})));
 return {parents,children};
}
/** Kept for compatibility with simple one-parent layout. */
export function overviewChildren(count:number,origin:Point):Point[]{return radialLayout(count,29,44,22).map(p=>({x:origin.x+p.x,y:origin.y+p.y}));}
