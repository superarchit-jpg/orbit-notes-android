/** Pure, offline map geometry for Orbit Notes v0.16. No React or native dependencies. */
export type MapPoint={x:number;y:number};
export type MapNode={id:string;parentId:string|null};
export type PositionedNode<T extends MapNode>={note:T;x:number;y:number;level:number};
export const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const NODE_DIAMETERS=[120,110,90,80,75,70] as const;
export const nodeRadius=(level:number)=>NODE_DIAMETERS[Math.min(level,NODE_DIAMETERS.length-1)]/2;

export function indexChildren<T extends MapNode>(notes:readonly T[]):Map<string,T[]>{
  const children=new Map<string,T[]>();
  for(const note of notes){
    if(!note.parentId)continue;
    const siblings=children.get(note.parentId);
    if(siblings)siblings.push(note);
    else children.set(note.parentId,[note]);
  }
  return children;
}

/** Build one consistent hierarchy. Each parent's angle is independent and persistent. */
export function radialTree<T extends MapNode>(
  root:T,
  notes:readonly T[],
  offsets:Readonly<Record<string,number>>={},
  collapsed:Readonly<Record<string,boolean>>={},
  children=indexChildren(notes)
):PositionedNode<T>[]{
  const placed:PositionedNode<T>[]=[];
  const visited=new Set<string>();
  const pending=[{note:root,x:0,y:0,level:0,incoming:-Math.PI/2}];
  while(pending.length){
    const {note,x,y,level,incoming}=pending.pop()!;
    if(visited.has(note.id))continue;
    visited.add(note.id);
    placed.push({note,x,y,level});
    if(collapsed[note.id])continue;
    const kids=children.get(note.id)??[];
    const count=kids.length;
    if(!count)continue;
    const offset=offsets[note.id]||0;
    // Siblings share a connector length. Increase it only when a parent
    // has enough children to need additional clearance; do not shrink
    // every successive level irrespective of local density.
    // Match the circle diameters in App.tsx (levels 0–5, then 70).
    // Keep at least 30 world units of visible clearance at deep levels.
    const parentRadius=nodeRadius(level);
    const childRadius=nodeRadius(level+1);
    const minimumDistance=parentRadius+childRadius+30;
    const baseDistance=(level===0?330:level===1?260*0.95:level===2?190*0.95:level===3?120:50)*0.95;
    const radius=Math.max(baseDistance,minimumDistance)+
      Math.min(80,Math.max(0,count-2)*12);
    for(let index=count-1;index>=0;index--){
      let angle:number;
      if(level===0){
        // A map opens with a single child at 12 o'clock, two at
        // 3 and 9 o'clock, and larger groups at polygon vertices.
        angle=count===1?-Math.PI/2:count===2?index*Math.PI:
          -Math.PI/2+index*2*Math.PI/count;
      }else{
        // One child continues directly outward; two are opposite
        // one another on an axis perpendicular to the incoming edge.
        angle=count===1?incoming:count===2?
          incoming-Math.PI/2+index*Math.PI:
          incoming-Math.PI/2+index*2*Math.PI/count;
      }
      angle+=offset;
      const stagger=count>1&&index%2===1?14:0;
      pending.push({
        note:kids[index],x:x+Math.cos(angle)*(radius+stagger),
        y:y+Math.sin(angle)*(radius+stagger),level:level+1,incoming:angle,
      });
    }
  }
  return placed;
}

export function pointBounds(points:readonly MapPoint[]){
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const {x,y} of points){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  return {minX,maxX,minY,maxY};
}

/** Frame a set of world points inside the visible canvas without changing their layout. */
export function fitMap(points:readonly MapPoint[],width:number,height:number,padding=90){
  if(!points.length)return {x:0,y:0,scale:1};
  const {minX,maxX,minY,maxY}=pointBounds(points);
  const usableW=Math.max(1,width-2*padding),usableH=Math.max(1,height-2*padding);
  const scale=clamp(Math.min(usableW/Math.max(1,maxX-minX),usableH/Math.max(1,maxY-minY)),.35,2);
  return {x:-(minX+maxX)/2*scale,y:-(minY+maxY)/2*scale,scale};
}
