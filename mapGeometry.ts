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
  // Allocate angular room to complete subtrees, not just immediate siblings.
  // This keeps deep branches outward-facing rather than folding them across
  // connectors from the map's heading to other first-level branches.
  const weights=new Map<string,number>();
  const weighing=new Set<string>();
  const weight=(note:T):number=>{
    if(weights.has(note.id))return weights.get(note.id)!;
    if(weighing.has(note.id))return 1;
    weighing.add(note.id);
    const kids=collapsed[note.id]?[]:(children.get(note.id)||[]);
    const result=kids.length?Math.max(1,kids.reduce((sum,k)=>sum+weight(k),0)):1;
    weighing.delete(note.id);
    weights.set(note.id,result);
    return result;
  };
  weight(root);
  const placed:PositionedNode<T>[]=[];
  const visited=new Set<string>();
  const walk=(note:T,x:number,y:number,level:number,direction=-Math.PI/2,sector=Math.PI*2)=>{
    if(visited.has(note.id))return;
    visited.add(note.id);
    placed.push({note,x,y,level});
    if(collapsed[note.id])return;
    const kids=children.get(note.id)||[];
    if(!kids.length)return;
    const total=kids.reduce((sum,k)=>sum+(weights.get(k.id)||1),0);
    // Root children occupy a complete ring. Descendants stay in a forward
    // wedge within the parent's inherited sector, so they do not fan backward.
    const available=level===0?Math.PI*2:Math.min(sector,Math.PI*0.72);
    const base=direction-available/2+(offsets[note.id]||0);
    const radius=(note.id===focusedId?160:level===0?155:132)+Math.min(42,Math.max(0,kids.length-4)*6);
    let cursor=0;
    kids.forEach((child,index)=>{
      const portion=available*(weights.get(child.id)||1)/Math.max(1,total);
      const preferred=base+cursor+portion/2;
      cursor+=portion;
      // Search nearby angles for node/connector clearance without
      // making every generation's connectors longer.
      const score=(angle:number)=>{
        const p={x:x+Math.cos(angle)*radius,y:y+Math.sin(angle)*radius};
        let penalty=Math.abs(normalizeAngle(angle-preferred))*95;
        for(const n of placed){
          if(n.note.id===note.id)continue;
          penalty+=Math.max(0,125-Math.hypot(p.x-n.x,p.y-n.y))*5;
          penalty+=Math.max(0,55-pointSegmentDistance(n,{x,y},p))*3;
        }
        for(const end of placed){
          const parent=placed.find(n=>n.note.id===end.note.parentId);
          if(!parent||parent.note.id===note.id)continue;
          penalty+=Math.max(0,65-pointSegmentDistance(p,parent,end))*4;
        }
        return penalty;
      };
      let angle=preferred,best=score(preferred);
      for(const deviation of [-0.4,0.4,-0.8,0.8,-1.2,1.2]){
        const candidate=preferred+deviation,cost=score(candidate);
        if(cost<best){best=cost;angle=candidate;}
      }
      // Reserve a modest buffer on either side of each subtree's sector.
      const childSector=Math.max(0.16,portion*0.88);
      const childRadius=radius+(index%2===1?20:0);
      walk(child,x+Math.cos(angle)*childRadius,y+Math.sin(angle)*childRadius,
        level+1,angle,childSector);
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
