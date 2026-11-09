(function (root) {
  const axes = {noise:30, property:25, space:20, access:15, upkeep:10};
  const labels = {noise:'安静度', property:'物业维护', space:'公共空间', access:'出入便利', upkeep:'楼栋与设备'};
  const positive = n => Number.isFinite(n) && n > 0;
  const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(Date.parse(s))
    && new Date(s).toISOString().slice(0,10) === s;
  const recent = (date, today, ttl) => day(date) && day(today)
    && Date.parse(today) - Date.parse(date) >= 0 && Date.parse(today) - Date.parse(date) <= ttl * 86400000;
  const point = p => p && ['WGS84','GCJ02'].includes(p.crs) && Number.isFinite(p.lon)
    && Math.abs(p.lon)<=180 && Number.isFinite(p.lat) && Math.abs(p.lat)<=90;
  const source = s => typeof s === 'string' && !!s.trim();
  function validate(d) {
    if (d?.version !== 1) throw Error('数据版本必须为 1');
    const keys = ['communities','listings','saleSamples','quality','routes','destinations'];
    for (const k of keys) if (!Array.isArray(d[k]) || d[k].some(r => !r || typeof r !== 'object')) throw Error(k+' 必须是记录数组');
    function ids(rows, label) {
      const seen = new Set();
      for (const r of rows) {
        if (!source(r.id) || seen.has(r.id)) throw Error(label+' ID 缺失或重复');
        seen.add(r.id);
      }
      return seen;
    }
    const communities = ids(d.communities,'小区');
    const destinations = ids(d.destinations,'目的地');
    for (const k of ['layouts','stationAccess']) {
      if (d[k] != null && (!Array.isArray(d[k]) || d[k].some(r => !r || !communities.has(r.communityId)))) {
        throw Error(k+' 存在无效记录或未知小区');
      }
    }
    ids(d.layouts||[],'户型');
    const layouts = new Map((d.layouts||[]).map(r=>[r.id,r]));
    for (const r of d.layouts||[]) {
      if (!source(r.name)) throw Error('户型名称缺失');
    }
    for (const r of d.stationAccess||[]) {
      if (!source(r.station)||!source(r.source)||(r.walkMinutes!=null&&!(Number.isFinite(r.walkMinutes)&&r.walkMinutes>=0))) {
        throw Error('站点步行记录须有车站、证据和有效分钟数');
      }
    }
    for (const r of d.listings) {
      if (r.layoutId!=null && layouts.get(r.layoutId)?.communityId!==r.communityId) throw Error('房源户型关联无效');
    }
    ids(d.listings,'房源'); ids(d.saleSamples,'出售样本');
    for (const k of ['listings','saleSamples','quality','routes']) {
      if (d[k].some(r => !communities.has(r.communityId))) throw Error(k+' 存在未知小区');
    }
    for (const r of [...d.communities,...d.destinations]) {
      if (!source(r.name) || (r.location != null && (!point(r.location) || !source(r.location.source)))) throw Error('名称或坐标证据有误');
    }
    for (const r of d.communities) {
      if (r.year != null && (!Number.isInteger(r.year) || r.year<1800 || r.year>2100)) throw Error('建成年份无效');
      if (r.tags != null && (!Array.isArray(r.tags) || r.tags.some(t=>typeof t!=='string'))) throw Error('标签必须是文本数组');
    }
    for (const r of [...d.listings,...d.saleSamples,...d.quality,...d.routes]) {
      if (!day(r.checkedAt) || !source(r.source)) throw Error('动态记录须填写证据来源与核验日期');
    }
    for (const r of [...d.listings,...d.saleSamples]) {
      if (['areaM2','monthlyRent','totalPrice'].some(k=>r[k]!=null&&!positive(r[k]))) throw Error('价格及面积须为正数或空值');
      if (r.bedrooms!=null && (!Number.isInteger(r.bedrooms)||r.bedrooms<0)) throw Error('卧室数无效');
    }
    for (const r of d.listings) if (!['active','inactive','unknown'].includes(r.status)) throw Error('房源状态无效');
    for (const r of d.quality) if (!Object.hasOwn(axes,r.axis) || ![0,1,2,3,4].includes(r.rating)) throw Error('品质维度或评分无效');
    for (const r of d.routes) {
      if (!destinations.has(r.destinationId) || !['transit','drive','walk','bike'].includes(r.mode)
        || !source(r.scenario) || (!positive(r.km) && !positive(r.minutes))) throw Error('路线记录无效');
    }
    return d;
  }
  function latest(rows, key) {
    const result = new Map();
    for (const r of rows) {
      const k = key(r);
      if (!result.has(k) || r.checkedAt >= result.get(k).checkedAt) result.set(k,r);
    }
    return [...result.values()];
  }
  const distinct = rows => latest(rows,r=>r.unitKey ? 'unit:'+r.unitKey : 'id:'+r.id);
  function current(rows,today) {
    return distinct(rows).filter(r=>r.status==='active' && r.tenure==='whole' && recent(r.checkedAt,today,7));
  }
  function matches(r,f) {
    return (f.rent==null || (positive(r.monthlyRent) && r.monthlyRent<=f.rent))
      && (f.area==null || (positive(r.areaM2) && r.areaM2>=f.area))
      && (f.bedrooms==null || r.bedrooms===f.bedrooms);
  }
  function median(values) {
    if (!values.length) return null;
    const a = [...values].sort((a,b)=>a-b);
    return (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)])/2;
  }
  function yieldEstimate(rents,sales,today,bedrooms,areaMin,areaMax) {
    const comparable = r => r.bedrooms===bedrooms && r.areaBasis==='gross'
      && positive(r.areaM2) && r.areaM2>=areaMin && r.areaM2<=areaMax && source(r.unitKey);
    const r = current(rents,today).filter(x=>comparable(x)&&positive(x.monthlyRent));
    const s = distinct(sales).filter(x=>comparable(x)&&x.kind==='asking'
      && recent(x.checkedAt,today,30)&&positive(x.totalPrice));
    return {rentN:r.length,saleN:s.length,pct:r.length>=3 && s.length>=3
      ? 1200*median(r.map(x=>x.monthlyRent/x.areaM2))/median(s.map(x=>x.totalPrice/x.areaM2)) : null};
  }
  function quality(rows,today) {
    const evidence = latest(rows.filter(r=>recent(r.checkedAt,today,180)),r=>r.axis);
    const coverage = evidence.reduce((sum,r)=>sum+axes[r.axis],0);
    const score = coverage===100 ? evidence.reduce((sum,r)=>sum+axes[r.axis]*r.rating/4,0) : null;
    return {coverage,score,evidence};
  }
  function distance(a,b) {
    if (!point(a) || !point(b) || a.crs!==b.crs) return null;
    const rad = Math.PI/180;
    const h = Math.sin((b.lat-a.lat)*rad/2)**2
      + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lon-a.lon)*rad/2)**2;
    return 12742*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
  }
  const api = {labels,validate,point,recent,latest,current,matches,median,yieldEstimate,quality,distance};
  if (typeof module !== 'undefined') module.exports=api;
  else root.RentModel=api;
})(globalThis);
