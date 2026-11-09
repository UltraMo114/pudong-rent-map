'use strict';
const M = RentModel;
const $ = id => document.getElementById(id);
const value = id => $(id).value === '' ? null : $(id).valueAsNumber;
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
const fmt = (v,suffix='',digits=0) => Number.isFinite(v) ? v.toLocaleString('zh-CN',{maximumFractionDigits:digits})+suffix : '待核验';
function node(tag,text,parent) {
  const e = document.createElement(tag);
  if (text != null) e.textContent=text;
  if (parent) parent.append(e);
  return e;
}
function link(parent,label,url) {
  try {
    const u = new URL(url);
    if (!['https:','http:'].includes(u.protocol)) return;
    const a=node('a',label,parent);
    a.href=u.href; a.target='_blank'; a.rel='noopener noreferrer';
  } catch {}
}
function options(id,rows,placeholder) {
  const select=$(id), previous=select.value;
  select.replaceChildren(new Option(placeholder,''));
  for (const r of rows) select.add(new Option(r.name,r.id));
  if (rows.some(r=>r.id===previous)) select.value=previous;
}
let data=M.validate(initialData);
function refresh() {
  options('destination',data.destinations,'选择目的地');
  if (data.destinations.length===1) $('destination').value=data.destinations[0].id;
  render();
}
function renderMap(rows,destination) {
  const box=$('map'), crs=$('crs').value;
  box.replaceChildren();
  const sites=rows.filter(r=>M.point(r.c.location)&&r.c.location.crs===crs)
    .map(r=>({p:r.c.location,name:r.c.name,id:r.c.id}));
  $('mapnote').textContent=rows.length-sites.length+' 个结果未在当前坐标系落点。';
  if (!sites.length) {
    node('p','当前无已核验坐标。可从小区卡片打开地址检索，或导入带坐标来源的数据。',box);
    return;
  }
  if (destination?.location?.crs===crs) sites.push({p:destination.location,name:destination.name});
  const svgNode=(tag,attrs,parent)=>{
    const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v);
    parent.append(e);
    return e;
  };
  const svg=svgNode('svg',{viewBox:'0 0 640 420','aria-label':'小区坐标分布'},box);
  const avgLat=sites.reduce((s,r)=>s+r.p.lat,0)/sites.length;
  const xs=sites.map(r=>r.p.lon*Math.cos(avgLat*Math.PI/180)), ys=sites.map(r=>r.p.lat);
  const mid=a=>(Math.min(...a)+Math.max(...a))/2;
  const span=a=>Math.max(...a)-Math.min(...a);
  const scale=Math.min(510/Math.max(span(xs),.002),315/Math.max(span(ys),.002));
  for(let x=40;x<640;x+=40) svgNode('path',{d:'M'+x+' 0V420',stroke:'#dce9df'},svg);
  for(let y=20;y<420;y+=40) svgNode('path',{d:'M0 '+y+'H640',stroke:'#dce9df'},svg);
  svgNode('text',{x:18,y:28,fill:'#31564b'},svg).textContent='↑ 北';
  sites.forEach((r,i)=>{
    const x=320+(xs[i]-mid(xs))*scale,y=210-(ys[i]-mid(ys))*scale;
    const g=svgNode('g',r.id?{tabindex:0,role:'button','aria-label':r.name}:{},svg);
    svgNode('title',{},g).textContent=r.name;
    svgNode('circle',{cx:x,cy:y,r:8,fill:r.id?'#236d58':'#af5825',stroke:'white','stroke-width':2},g);
    svgNode('text',{x:x+11,y:y-9,'font-size':12,fill:'#1d4036'},g).textContent=r.id ? i+1 : '目的地';
    if(r.id){
      const open=()=>{const card=$('card-'+r.id);card.focus();card.scrollIntoView({block:'nearest'});};
      g.addEventListener('click',open);
      g.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();open();}});
    }
  });
  node('p',sites.map((s,i)=>s.id ? (i+1)+' '+s.name : '目的地 '+s.name).join(' · '),box);
}
function render() {
  const date=today(), destination=data.destinations.find(x=>x.id===$('destination').value);
  const validRoutes=data.routes.filter(r=>r.destinationId===destination?.id && r.mode===$('mode').value && M.recent(r.checkedAt,date,30));
  const scenarios=[...new Set(validRoutes.map(r=>r.scenario))].sort();
  options('scenario',scenarios.map(s=>({id:s,name:s})),'选择同一出行场景');
  if (scenarios.length===1) $('scenario').value=scenarios[0];
  const filter={rent:value('rent'),area:value('area'),bedrooms:value('beds')};
  const hasFilter=Object.values(filter).some(x=>x!=null);
  const year=value('year'), yb=value('yb'), ya=value('ya'), yz=value('yz');
  const comparable=Number.isInteger(yb)&&yb>=0&&ya>0&&yz>=ya;
  let rows=data.communities.map(c=>{
    const rents=data.listings.filter(r=>r.communityId===c.id);
    const active=M.current(rents,date);
    const shown=active.filter(r=>M.matches(r,filter));
    const sales=data.saleSamples.filter(r=>r.communityId===c.id);
    return {c,active,shown,
      y:comparable ? M.yieldEstimate(rents,sales,date,yb,ya,yz) : null,
      q:M.quality(data.quality.filter(r=>r.communityId===c.id),date),
      direct:M.distance(c.location,destination?.location),
      route:M.latest(validRoutes.filter(r=>r.communityId===c.id&&r.scenario===$('scenario').value),r=>r.communityId)[0]};
  }).filter(r=>(year==null||(r.c.year!=null&&r.c.year>=year))&&(!hasFilter||r.shown.length));
  const sorters={direct:r=>r.direct,route:r=>r.route?.km,minutes:r=>r.route?.minutes,quality:r=>r.q.score==null?null:-r.q.score};
  const sort=sorters[$('sort').value];
  if(sort) rows.sort((a,b)=>(sort(a)??Infinity)-(sort(b)??Infinity));
  $('summary').textContent=rows.length+' / '+data.communities.length+' 个小区 · 当前筛选命中 '+rows.reduce((n,r)=>n+r.shown.length,0)+' 条近期在租观察。0 表示本库无匹配记录。';
  $('cards').replaceChildren();
  if(!rows.length) node('article','没有符合条件的已核验记录。清空筛选可重新查看候选小区。',$('cards'));
  for(const {c,shown,y,q,direct,route} of rows){
    const card=node('article',null,$('cards'));
    card.id='card-'+c.id;card.tabIndex=-1;
    node('h2',c.name,card);
    node('p',[c.area,c.address].filter(Boolean).join(' · '),card);
    node('p',fmt(c.year,' 年建成')+' · '+fmt(c.households,' 户'),card);
    for(const t of c.tags||[]) node('span',t,card).className='tag';
    if(c.note) node('p',c.note,card).className='muted';
    const refs=node('p',null,card);
    link(refs,'小区资料',c.source);
    if(c.location) {refs.append(' · ');link(refs,'坐标来源',c.location.source);}
    refs.append(' · ');
    link(refs,'高德搜索地址','https://uri.amap.com/search?city=上海&keyword='+encodeURIComponent([c.address,c.name.split('｜')[0]].filter(Boolean).join(' ')));
    node('p','品质 '+fmt(q.score,' / 100',1)+' · 证据覆盖 '+q.coverage+'%',card);
    for(const e of q.evidence){
      const p=node('p',M.labels[e.axis]+' '+e.rating+'/4 · '+e.checkedAt+' · '+e.source,card);
      link(p,' 查看证据',e.source);
    }
    node('p','在租 '+shown.length+' 条观察 · '+fmt(M.median(shown.map(r=>r.monthlyRent).filter(Number.isFinite)),' 元/月中位数'),card);
    for(const r of shown){
      const p=node('p',[fmt(r.monthlyRent,' 元/月'),fmt(r.areaM2,' ㎡',1),fmt(r.bedrooms,' 室'),r.checkedAt,r.source].join(' · '),card);
      link(p,' 查看房源来源',r.source);
    }
    node('p','毛挂牌租售比 '+fmt(y?.pct,'%',2)+(y?' · 租 '+y.rentN+' / 售 '+y.saleN+' 套':' · 对照组条件无效'),card);
    node('p','直线 '+fmt(direct,' km',2)+' · 路线 '+fmt(route?.km,' km',2)+' · '+fmt(route?.minutes,' 分钟',1),card);
    if(route) {
      const p=node('p','路线场景 '+route.scenario+' · '+route.checkedAt+' · '+route.source,card);
      link(p,' 查看路线证据',route.source);
    }
  }
  renderMap(rows,destination);
}
$('file').addEventListener('change',async e=>{
  if(!e.target.files.length) return;
  try{
    const file=e.target.files[0];
    if(file.size>5*1024*1024) throw Error('本地试点文件上限为 5 MiB');
    data=M.validate(JSON.parse(await file.text()));
    $('error').textContent='';
    refresh();
  }catch(error){$('error').textContent='载入失败 · '+error.message;}
  finally{e.target.value='';}
});
for(const id of ['rent','area','year','beds','destination','mode','scenario','sort','crs','yb','ya','yz']) $(id).addEventListener('input',render);
refresh();
