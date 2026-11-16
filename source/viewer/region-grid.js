// Rows run north to south; shader bounds use south-origin UVs.
export function makeRegionalGrid(columns,rows,folder,refinements=[]){
  const tiles=[];
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    tiles.push({id:`0/${x}/${y}`,depth:0,bounds:[x/columns,1-(y+1)/rows,1/columns,1/rows],color:`${folder}/${x}-${y}.jpg`});
  }
  // A refinement may bisect either axis or split both. Parents remain valid fallbacks.
  for(const {parent,columns:cols,rows:rs,files} of refinements){
    const tile=tiles.find(t=>t.id===parent);
    if(!tile||![1,2].includes(cols)||![1,2].includes(rs)||cols*rs<2||files.length!==cols*rs)throw Error('Invalid refinement of '+parent);
    const [l,b,w,h]=tile.bounds;
    for(let j=0;j<rs;j++)for(let i=0;i<cols;i++){
      tiles.push({id:parent+'/'+i+'-'+j,depth:tile.depth+1,parent,bounds:[l+i*w/cols,b+(rs-1-j)*h/rs,w/cols,h/rs],color:files[j*cols+i]});
    }
  }
  return tiles;
}
