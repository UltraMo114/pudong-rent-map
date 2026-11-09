(function (root) {
  const hub = '龙华中路';
  // Consecutive stations in the displayed excerpts. Shared names here are verified transfers.
  const lines = [
    {id:'7', color:'#df712b', stops:['东安路',hub,'后滩','长清路','耀华路','云台路','高科西路','杨高南路','锦绣路','芳华路','龙阳路','花木路']},
    {id:'12', color:'#328963', stops:['漕宝路','龙漕路','龙华',hub,'大木桥路','嘉善路','陕西南路']},
    {id:'8', color:'#2285be', stops:['中华艺术宫','耀华路','成山路','杨思','东方体育中心','凌兆新村','芦恒路']},
    {id:'13', color:'#bd6398', stops:['成山路','东明路','华鹏路']},
    {id:'11', color:'#9b5245', stops:['龙华','云锦路','龙耀路','东方体育中心','三林','三林东','浦三路','康恒路','御桥','罗山路','秀沿路']}
  ];
  const positions = {
    东安路:[280,85], 龙华中路:[280,160], 后滩:[365,160], 长清路:[450,160], 耀华路:[535,160],
    云台路:[620,160], 高科西路:[705,160], 杨高南路:[790,160], 锦绣路:[875,160], 芳华路:[960,160],
    龙阳路:[1045,160], 花木路:[1130,160], 漕宝路:[45,315], 龙漕路:[130,315], 龙华:[215,315],
    大木桥路:[390,95], 嘉善路:[490,55], 陕西南路:[600,55], 中华艺术宫:[535,87], 成山路:[535,224],
    杨思:[535,293], 东方体育中心:[535,380], 凌兆新村:[440,458], 芦恒路:[350,458], 云锦路:[310,380],
    龙耀路:[420,380], 三林:[620,380], 三林东:[705,380], 浦三路:[790,380], 康恒路:[875,380],
    御桥:[960,380], 罗山路:[1045,380], 秀沿路:[1130,380], 东明路:[640,224], 华鹏路:[745,224]
  };
  const key = (station,line) => station+'|'+line;
  const order = (a,b) => a.transfers-b.transfers || a.stops-b.stops;
  function routes() {
    const graph = new Map();
    const byStation = new Map();
    for (const line of lines) for (const [i,station] of line.stops.entries()) {
      const id=key(station,line.id);
      const state={id,station,line:line.id};
      graph.set(id,{state,edges:[line.stops[i-1],line.stops[i+1]].filter(Boolean)
        .map(next=>({id:key(next,line.id),transfer:false}))});
      if (!byStation.has(station)) byStation.set(station,[]);
      byStation.get(station).push(state);
    }
    for (const states of byStation.values()) for (const state of states) {
      for (const other of states) if (other.id!==state.id) graph.get(state.id).edges.push({id:other.id,transfer:true});
    }
    const best=new Map();
    const queue=byStation.get(hub).map(state=>({id:state.id,transfers:0,stops:0,path:[state]}));
    while(queue.length){
      queue.sort(order);
      const here=queue.shift();
      if(best.has(here.id)) continue;
      best.set(here.id,here);
      for(const edge of graph.get(here.id).edges) if(!best.has(edge.id)) {
        queue.push({id:edge.id,transfers:here.transfers+Number(edge.transfer),
          stops:here.stops+Number(!edge.transfer),path:[graph.get(edge.id).state,...here.path]});
      }
    }
    return new Map([...byStation].map(([name,states])=>[name,states.map(s=>best.get(s.id)).filter(Boolean).sort(order)[0]]));
  }
  const api={hub,lines,positions,routes};
  if(typeof module==='object') module.exports=api;
  else root.Metro=api;
})(globalThis);
