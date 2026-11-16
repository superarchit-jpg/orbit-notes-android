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

/** Build one consistent hierarchy. Each parent's angle is independent and persistent. */
export function radialTree<T extends MapNode>(
  root:T,
  notes:readonly T[],
  offsets:Readonly<Record<string,number>>={},
  collapsed:Readonly<Record<string,boolean>>={}
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
  const walk=(note:T,x:number,y:number,level:number,bearing=0)=>{
    if(visited.has(note.id))return;
    visited.add(note.id);
    placed.push({note,x,y,level});
    if(collapsed[note.id])return;
    const kids=children.get(note.id)||[];
    const radius=Math.max(165,kids.length*46)+Math.max(0,level-1)*48;
    const offset=offsets[note.id]||0;
    kids.forEach((child,index)=>{
      const angle=bearing-Math.PI/2+index*2*Math.PI/kids.length+offset;
      walk(child,x+Math.cos(angle)*radius,y+Math.sin(angle)*radius,level+1,angle+Math.PI/2);
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
