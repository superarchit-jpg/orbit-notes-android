/** Pure, offline map geometry for Orbit Notes v0.16. No React or native dependencies. */
export type MapPoint={x:number;y:number};
export type MapNode={id:string;parentId:string|null};
export type PositionedNode<T extends MapNode>={note:T;x:number;y:number;level:number};
export const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export const normalizeAngle=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));

/** Rotate a point around a fixed parent, preserving its distance. */
export function rotateAround(point:MapPoint,center:MapPoint,angle:number):MapPoint{
  const dx=point.x-center.x,dy=point.y-center.y;
  const c=Math.cos(angle),s=Math.sin(angle);
  return {x:center.x+dx*c-dy*s,y:center.y+dx*s+dy*c};
}

/** Finger movement interpreted as a circular turn about the focused parent. */
export function circularDragAngle(start:MapPoint,end:MapPoint,center:MapPoint):number{
  const a=Math.atan2(start.y-center.y,start.x-center.x);
  const b=Math.atan2(end.y-center.y,end.x-center.x);
  return normalizeAngle(b-a);
}

/** Minimum distance from a point to a finite connector segment. */
export function pointSegmentDistance(p:MapPoint,a:MapPoint,b:MapPoint):number{
  const dx=b.x-a.x,dy=b.y-a.y,denom=dx*dx+dy*dy;
  if(denom<0.0001)return Math.hypot(p.x-a.x,p.y-a.y);
  const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/denom,0,1);
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}

/** A branch's connector must not pass through an unrelated node. */
export function layoutCollisions<T extends MapNode>(nodes:readonly PositionedNode<T>[],clearance=52){
  const byId=new Map(nodes.map(n=>[n.note.id,n]));
  const result:{nodeId:string;connectorId:string;distance:number}[]=[];
  for(const node of nodes){
    for(const end of nodes){
      const parent=byId.get(end.note.parentId||'');
      if(!parent||node.note.id===end.note.id||node.note.id===parent.note.id)continue;
      const distance=pointSegmentDistance(node,parent,end);
      if(distance<clearance)result.push({nodeId:node.note.id,connectorId:end.note.id,distance});
    }
  }
  return result;
}

/** Build one consistent hierarchy. Each parent's angle is independent and persistent. */
export function radialTree<T extends MapNode>(
  root:T,
  notes:readonly T[],
  offsets:Readonly<Record<string,number>>={},
  collapsed:Readonly<Record<string,boolean>>={},
  focusedId?:string
):PositionedNode<T>[]{
  const children=new Map<string,T[]>();
  for(const note of notes){
    if(!note.parentId)continue;
    const siblings=children.get(note.parentId)||[];
    siblings.push(note);
    children.set(note.parentId,siblings);
  }
  const placed:PositionedNode<T>[]=[];
  const visited=new Set<string>();
  const walk=(note:T,x:number,y:number,level:number,incoming=-Math.PI/2)=>{
    if(visited.has(note.id))return;
    visited.add(note.id);
    placed.push({note,x,y,level});
    if(collapsed[note.id])return;
    const kids=children.get(note.id)||[];
    const count=kids.length;
    if(!count)return;
    const offset=offsets[note.id]||0;
    // Siblings share a connector length. Increase it only when a parent
    // has enough children to need additional clearance; do not shrink
    // every successive level irrespective of local density.
    // Match the circle diameters in App.tsx (levels 0–5, then 70).
    // Keep at least 30 world units of visible clearance at deep levels.
    const diameters=[120,110,90,80,75,70];
    const parentRadius=diameters[Math.min(level,5)]/2;
    const childRadius=diameters[Math.min(level+1,5)]/2;
    const minimumDistance=parentRadius+childRadius+30;
    const baseDistance=(level===0?330:level===1?260*0.95:level===2?190*0.95:level===3?120:50)*0.95;
    const radius=Math.max(baseDistance,minimumDistance)+
      Math.min(80,Math.max(0,count-2)*12);
    kids.forEach((child,index)=>{
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
      walk(child,x+Math.cos(angle)*(radius+stagger),
        y+Math.sin(angle)*(radius+stagger),level+1,angle);
    });
  };
  walk(root,0,0,0);

  return placed;
}

/** Convert a screen coordinate into the unrotated, unscaled world frame. */
export function screenToWorld(
  point:MapPoint,center:MapPoint,translation:MapPoint,scale:number,rotation:number
):MapPoint{
  const x=point.x-center.x-translation.x,y=point.y-center.y-translation.y;
  const c=Math.cos(rotation),s=Math.sin(rotation),k=Math.max(.001,scale);
  return {x:(x*c+y*s)/k,y:(-x*s+y*c)/k};
}

/** Frame a set of world points inside the visible canvas without changing their layout. */
export function fitMap(points:readonly MapPoint[],width:number,height:number,padding=90){
  if(!points.length)return {x:0,y:0,scale:1};
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const usableW=Math.max(1,width-2*padding),usableH=Math.max(1,height-2*padding);
  const scale=clamp(Math.min(usableW/Math.max(1,maxX-minX),usableH/Math.max(1,maxY-minY)),.35,2);
  return {x:-(minX+maxX)/2*scale,y:-(minY+maxY)/2*scale,scale};
}
