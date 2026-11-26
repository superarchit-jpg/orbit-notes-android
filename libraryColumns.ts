/** Balanced, stable visual placement. Preserve the item order used for Custom sorting.
 * Prefer a prior column to avoid shifting unrelated cards. Use the shorter column
 * when keeping the prior column would leave a significant empty space.
 */
export function balancedLibraryPositions<T extends {id:string}>(
 items:readonly T[],heights:Readonly<Record<string,number>>,grid:boolean,
 previous:Readonly<Record<string,number>>={},
 forced:Readonly<Record<string,0|1>>={},
 singleResult=false
):{item:T;column:number;top:number}[]{
 const bottoms=[0,0],gap=10;
 return items.map(item=>{
  const h=Math.max(40,heights[item.id]??(grid?152:88));
  let column=0;
  if(grid&&!singleResult){
   const preferred=previous[item.id];
   const lower=bottoms[0]<=bottoms[1]?0:1;
   column=forced[item.id]===0||forced[item.id]===1?forced[item.id]:(preferred===0||preferred===1)&&bottoms[preferred]-bottoms[lower]<=h*0.35?preferred:lower;
  }
  const top=bottoms[column];
  bottoms[column]+=h+gap;
  return {item,column,top};
 });
}
