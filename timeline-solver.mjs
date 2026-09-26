// Integer difference constraints: x[to] <= x[from] + cost.
// x[0] is departure, x[i+1] a point; the separate origin fixes absolute pins.
function feasible(lo,hi,endLo,endHi,startMax,pins,windows){
  const n=lo.length,origin=n+1,edges=[];
  for(let i=0;i<n;i++)edges.push([i,i+1,hi[i]],[i+1,i,-lo[i]]);
  edges.push([origin,0,startMax],[0,origin,0],[origin,n,endHi],[n,origin,-endLo]);
  for(const [index,time] of pins)edges.push([origin,index+1,time],[index+1,origin,-time]);
  if(windows)for(let i=0;i+80<n;i++)edges.push([i+81,i+1,-3660]);
  const x=Array(n+2).fill(0);
  for(let pass=0;pass<n+2;pass++){
    let changed=false;
    for(const [from,to,cost] of edges)if(x[to]>x[from]+cost){x[to]=x[from]+cost;changed=true;}
    if(!changed)return {offset:x[0]-x[origin],gaps:lo.map((_,i)=>x[i+1]-x[i])};
  }
  return null;
}
function preferred(lo,hi,wanted,endLo,endHi,startMax,pins,windows){
  const base=wanted.map((n,i)=>Math.max(lo[i],Math.min(hi[i],n)));
  let high=Math.max(...lo.map((n,i)=>Math.max(base[i]-n,hi[i]-base[i]))),low=-1;
  const solve=radius=>feasible(lo.map((n,i)=>Math.max(n,base[i]-radius)),hi.map((n,i)=>Math.min(n,base[i]+radius)),endLo,endHi,startMax,pins,windows);
  let result=solve(high);if(!result)return null;
  while(high-low>1){const middle=Math.floor((low+high)/2),candidate=solve(middle);if(candidate){high=middle;result=candidate;}else low=middle;}
  return result;
}
function triple(gaps,ordinary){for(let i=3;i<gaps.length;i++)if(ordinary[i]&&ordinary[i-1]&&ordinary[i-2]&&gaps[i]===gaps[i-1]&&gaps[i]===gaps[i-2])return i;return -1;}

export function solveTimeline({lo,hi,ordinary,preferred:wanted,endLo,endHi,startMax=0,pins=[],windows=true}){
  if(lo.some((n,i)=>n>hi[i])||endLo>endHi||startMax<0)return null;
  let lower=[...lo],upper=[...hi],result=preferred(lower,upper,wanted,endLo,endHi,startMax,pins,windows);
  if(!result)return null;
  // This extra distribution rule is searched with bounded branches. A failed
  // branch search is not a proof of mathematical infeasibility.
  for(let guard=0;guard<lo.length*2;guard++){
    const end=triple(result.gaps,ordinary);if(end<0)return result;
    let best=null;
    for(const i of [end,end-1,end-2])for(const direction of [-1,1]){
      const a=[...lower],b=[...upper],value=result.gaps[end];
      if(direction<0)b[i]=Math.min(b[i],value-1);else a[i]=Math.max(a[i],value+1);
      if(a[i]>b[i])continue;
      const candidate=preferred(a,b,wanted,endLo,endHi,startMax,pins,windows);
      if(!candidate||triple(candidate.gaps,ordinary)===end)continue;
      const score=candidate.gaps.reduce((sum,n,j)=>sum+Math.abs(n-wanted[j]),0);
      if(!best||score<best.score)best={candidate,a,b,score};
    }
    if(!best)return null;
    result=best.candidate;lower=best.a;upper=best.b;
  }
  return null;
}
