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
  collapsed:Readonly<Record<string,boolean>>={}
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
    const radius=Math.max(215,155+kids.length*48)+level*115+
      (level===0?Math.min(260,Math.sqrt(total)*40):0);
    let cursor=0;
    kids.forEach(child=>{
      const portion=available*(weights.get(child.id)||1)/Math.max(1,total);
      const angle=base+cursor+portion/2;
      cursor+=portion;
      // Reserve a modest buffer on either side of each subtree's sector.
      const childSector=Math.max(0.16,portion*0.88);
      walk(child,x+Math.cos(angle)*radius,y+Math.sin(angle)*radius,
        level+1,angle,childSector);
    });
  };
  walk(root,0,0,0);

  // Resolve collisions by shifting complete first-level subtrees outward.
  // Descendants and their connectors move together, preserving the user's
  // manual branch rotations and relative positions.
  const rootChildren=children.get(root.id)||[];
  const firstAncestor=(id:string):string=>{
    let n=notes.find(item=>item.id===id);
    const seen=new Set<string>();
    while(n&&n.parentId&&n.parentId!==root.id&&!seen.has(n.id)){
      seen.add(n.id);
      n=notes.find(item=>item.id===n!.parentId);
    }
    return n?.parentId===root.id?n.id:'';
  };
  const subtreeOf=(id:string)=>placed.filter(n=>firstAncestor(n.note.id)===id);
  const rootPoint=placed.find(n=>n.note.id===root.id);
  if(rootPoint&&rootChildren.length>1){
    for(let iteration=0;iteration<12;iteration++){
      let moved=false;
      const conflicts=layoutCollisions(placed,56);
      const overlaps:{a:string;b:string}[]=[];
      for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
        if(Math.hypot(placed[i].x-placed[j].x,placed[i].y-placed[j].y)<110)
          overlaps.push({a:placed[i].note.id,b:placed[j].note.id});
      }
      const moveIds=new Set<string>();
      for(const c of conflicts){
        const a=firstAncestor(c.nodeId),b=firstAncestor(c.connectorId);
        if(a&&b&&a!==b)moveIds.add(a);
      }
      for(const c of overlaps){
        const a=firstAncestor(c.a),b=firstAncestor(c.b);
        if(a&&b&&a!==b)moveIds.add(a);
      }
      for(const id of moveIds){
        const anchor=placed.find(n=>n.note.id===id);
        if(!anchor)continue;
        const dx=anchor.x-rootPoint.x,dy=anchor.y-rootPoint.y;
        const len=Math.max(1,Math.hypot(dx,dy));
        const shift=65;
        for(const n of subtreeOf(id)){n.x+=shift*dx/len;n.y+=shift*dy/len;}
        moved=true;
      }
      if(!moved)break;
    }
  }
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
