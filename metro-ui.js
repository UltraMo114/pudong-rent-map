'use strict';
const metroRoutes=Metro.routes();
const svgNS='http://www.w3.org/2000/svg';
let selectedStation='三林';
function svgItem(tag,attrs,parent) {
  const el=document.createElementNS(svgNS,tag);
  for(const [name,value] of Object.entries(attrs)) el.setAttribute(name,value);
  parent.append(el);
  return el;
}
function selectStation(name,focusMap=false) {
  selectedStation=name;
  renderMetro();
  if(focusMap) document.querySelector('[data-station][aria-pressed="true"]')?.focus();
}
function renderMetro() {
  const max=$('transfer-limit').value;
  const available=[...metroRoutes].filter(([,r])=>r && (max==='all'||r.transfers<=Number(max)));
  available.sort((a,b)=>a[1].transfers-b[1].transfers||a[1].stops-b[1].stops);
  if(!available.some(([s])=>s===selectedStation)) selectedStation=Metro.hub;
  options('station-picker',available.map(([name,r])=>({id:name,name:name+(r.transfers?' · 换乘 '+r.transfers:' · 直达')})),'选择车站');
  $('station-picker').value=selectedStation;
  const route=metroRoutes.get(selectedStation);
  const map=$('metro-map');
  map.replaceChildren();
  const svg=svgItem('svg',{viewBox:'0 0 1180 500','aria-label':'龙华中路地铁通勤图'},map);
  const points=stops=>stops.map(s=>Metro.positions[s].join(',')).join(' ');
  for(const line of Metro.lines) {
    svgItem('polyline',{points:points(line.stops),fill:'none',stroke:line.color,'stroke-width':6,
      opacity:.4,'stroke-linecap':'round','stroke-linejoin':'round'},svg);
  }
  for(let i=1;i<route.path.length;i++){
    const a=route.path[i-1],b=route.path[i];
    if(a.station===b.station) continue;
    const color=Metro.lines.find(line=>line.id===a.line).color;
    svgItem('polyline',{points:points([a.station,b.station]),fill:'none',stroke:color,'stroke-width':7,'stroke-linecap':'round'},svg);
  }
  for(const [station,r] of available) {
    const [x,y]=Metro.positions[station];
    const hub=station===Metro.hub, selected=station===selectedStation;
    const color=['#087d61','#579887','#879e95'][Math.min(2,r.transfers)];
    const opacity=[1,.76,.53][Math.min(2,r.transfers)];
    const g=svgItem('g',{tabindex:0,role:'button','data-station':station,'aria-pressed':selected,
      'aria-label':station+(hub?'，通勤终点':'，换乘 '+r.transfers+' 次')},svg);
    svgItem('circle',{cx:x,cy:y,r:22,fill:'transparent'},g);
    svgItem('circle',{cx:x,cy:y,r:hub?12:selected?10:7,fill:hub?'#203e33':color,
      opacity:hub||selected?1:opacity,stroke:selected?'#203e33':'white','stroke-width':2},g);
    svgItem('text',{x,y:y+(station==='龙华中路'?31:25),'text-anchor':'middle',
      fill:'#233b32','font-size':hub?16:13,'font-weight':hub||selected?700:400},g).textContent=station;
    g.addEventListener('click',()=>selectStation(station,true));
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectStation(station,true);}});
  }
  renderStation(route);
}
function renderStation(route) {
  const panel=$('station-panel');
  panel.replaceChildren();
  node('h2',selectedStation,panel);
  const legs=[route.path[0].line+' 号线'];
  for(let i=1;i<route.path.length;i++) if(route.path[i-1].line!==route.path[i].line) {
    legs.push('在'+route.path[i].station+'换 '+route.path[i].line+' 号线');
  }
  node('p',selectedStation===Metro.hub?'通勤终点':(route.transfers?route.transfers+' 次换乘':'直达')+' · '+route.stops+' 站',panel);
  if(route.stops) node('p',legs.join(' → ')+' → 龙华中路',panel).className='muted';
  const access=new Map((data.stationAccess||[]).filter(a=>a.station===selectedStation).map(a=>[a.communityId,a]));
  const provider=$('provider').value, walk=value('walk-limit'), year=value('year');
  const filter={rent:value('rent'),area:value('area'),bedrooms:value('beds')};
  const groups=[];
  for(const c of data.communities){
    const a=access.get(c.id);
    if(!a || (walk!=null && !(Number.isFinite(a.walkMinutes)&&a.walkMinutes<=walk))
      || (year!=null && !(c.year>=year))) continue;
    const observations=data.listings.filter(r=>r.communityId===c.id);
    const fresh=observations.filter(r=>r.status==='active'&&r.tenure==='whole'&&M.recent(r.checkedAt,today(),7));
    const unitKey=r=>r.unitKey?'unit:'+r.unitKey:'id:'+r.id;
    const activeKeys=new Set(M.current(observations,today()).map(unitKey));
    const indexed=observations.filter(r=>r.status==='unknown'&&r.evidenceKind==='indexed_snapshot'&&r.tenure==='whole'
      && !activeKeys.has(unitKey(r)));
    const visible=[...fresh.filter(r=>activeKeys.has(unitKey(r))),...indexed];
    for(const r of visible.filter(r=>(!provider||r.provider===provider)&&M.matches(r,filter))){
      const layout=(data.layouts||[]).find(l=>l.id===r.layoutId&&l.communityId===c.id);
      const key=layout?'layout:'+layout.id:unitKey(r);
      let group=groups.find(g=>g.key===key&&g.community.id===c.id);
      if(!group){group={key,community:c,access:a,layout,rows:[]};groups.push(group);}
      group.rows.push(r);
    }
  }
  if(!groups.length){
    node('p',access.size?'当前没有符合筛选条件的近期整租挂牌。':'本站还没有已录入的站点与小区关联。',panel);
    node('p','可导入本地 JSON，或去平台查找并核验。',panel).className='muted';
  }
  const links=node('p',null,panel);
  for(const [name,url] of [['贝壳','https://sh.ke.com/zufang/'],['我爱我家','https://sh.5i5j.com/zufang/'],['自如','https://sh.ziroom.com/z/']]){
    if(links.childNodes.length) links.append(' · ');
    link(links,name,url);
  }
  for(const {community:c,access:a,layout,rows} of groups){
    const card=node('article',null,panel);
    node('h3',layout?.name||'格局待核 · '+fmt(rows[0].bedrooms,' 室')+(Number.isInteger(rows[0].livingRooms)?rows[0].livingRooms+' 厅':''),card);
    const walkInfo=node('p',c.name+' · '+(Number.isFinite(a.walkMinutes)?fmt(a.walkMinutes,' 分钟步行'):Number.isFinite(a.reportedMeters)?fmt(a.reportedMeters,' 米（平台标注）'):'步行待核'),card);
    link(walkInfo,' · 到站证据',a.source);
    for(const tag of c.tags||[]) node('span',tag,card).className='tag';
    if(layout?.floorplanImage && /^https:\/\//i.test(layout.floorplanImage)){
      const img=node('img',null,card);
      img.addEventListener('error',()=>{img.replaceWith(node('p','户型图暂时无法加载'));});
      img.loading='lazy';img.referrerPolicy='no-referrer';img.alt=layout.name+'户型图';img.src=layout.floorplanImage;
    } else node('p','户型图待补',card).className='muted';
    if(layout?.floorplanUrl) link(card,'查看户型图来源',layout.floorplanUrl);
    const details=node('details',null,card);
    details.open=true;
    node('summary','查看 '+rows.length+' 条挂牌记录',details);
    for(const r of rows.sort((a,b)=>(a.monthlyRent??Infinity)-(b.monthlyRent??Infinity))){
      const p=node('p',null,details);
      node('strong',fmt(r.monthlyRent,' 元/月'),p);
      p.append(' · '+[fmt(r.areaM2,' ㎡',1),r.floor||'楼层待核',r.decoration||'装修待核'].join(' · '));
      const snapshot=r.evidenceKind==='indexed_snapshot';
      node('small',[r.provider||'来源未分类',snapshot?'索引快照 · 在租待核':'核验 '+r.checkedAt,
        snapshot&&r.postedAt?'平台发布 '+r.postedAt:null,r.fees||'费用口径待核'].filter(Boolean).join(' · '),details);
      details.append(' ');
      link(details,snapshot?'来源列表':'原挂牌',r.url||r.source);
    }
  }
}
$('station-picker').addEventListener('change',e=>{if(e.target.value)selectStation(e.target.value);});
for(const id of ['transfer-limit','provider','rent','area','beds','year','walk-limit']) $(id).addEventListener('input',renderMetro);
document.addEventListener('rent-data-loaded',renderMetro);
renderMetro();
