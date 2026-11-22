/** Stable two-column partition; preserves Keep-style alternating masonry order. */
export function partitionLibraryColumns<T>(items:readonly T[],grid:boolean):T[][]{
 if(!grid)return [Array.from(items)];
 const columns:T[][]=[[],[]];
 items.forEach((item,index)=>columns[index%2].push(item));
 return columns;
}
