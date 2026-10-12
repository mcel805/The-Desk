export const tradeColors=Object.freeze({buy:'#2962ff',sell:'#f23645',stop:'#e3b75d',target:'#089981'});
const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;
export function snapPrice(value,tick){return Number((Math.round(Number(value)/tick)*tick).toPrecision(12));}

// Starter offsets are editable UI defaults, not strategy or risk recommendations.
export function starterBracket({entry,side,tick,stop,target,distance}){
  entry=Number(entry);tick=Number(tick);
  if(!positive(entry)||!positive(tick)||entry<tick*3)return {};
  const sign=side==='buy'?1:-1;
  const gap=snapPrice(Math.min(Math.max(Number(distance)||entry*.001,tick*10),(entry-tick)/3),tick)||tick;
  const validStop=positive(stop)&&(entry-Number(stop))*sign>=tick*.999;
  const validTarget=positive(target)&&(Number(target)-entry)*sign>=tick*.999;
  return {stop:validStop?Number(stop):snapPrice(entry-sign*gap,tick),target:validTarget?Number(target):snapPrice(entry+sign*gap*2,tick)};
}

export function moveDraftBracket(item,field,value,tick){
  const entry=Number(item.entry),sign=item.side==='buy'?1:-1;
  if(!positive(value)||!positive(tick))return {};
  let price=Math.max(tick,snapPrice(value,tick));
  if(field==='entry'){
    // Move the complete bracket, retaining the user's chosen distances.
    const offsets=['stop','target'].filter(f=>positive(item[f])).map(f=>Number(item[f])-entry);
    price=Math.max(price,snapPrice(tick-Math.min(0,...offsets),tick));
    const result={entry:price};
    for(const f of ['stop','target'])if(positive(item[f]))result[f]=snapPrice(Number(item[f])+price-entry,tick);
    return result;
  }
  if(field==='stop'||field==='target'){
    const direction=field==='stop'?-sign:sign;
    price=direction<0?Math.min(price,snapPrice(entry-tick,tick)):Math.max(price,snapPrice(entry+tick,tick));
    return positive(price)?{[field]:price}:{};
  }
  return {[field]:price};
}

export function bracketLabel(item,field,{tick}={}){
  const qty=Number(item.qty).toLocaleString('en-US',{maximumFractionDigits:8}),entry=Number(item.entry??item.price??item.trigger);
  if(field==='stop'||field==='target'){
    const distance=(Number(item[field])-entry)*(item.side==='buy'?1:-1);
    const ticks=positive(tick)?' · '+(distance<0?'−':'+')+Math.abs(distance/Number(tick)).toLocaleString('en-US',{maximumFractionDigits:2})+' ticks':'';
    return qty+' · '+(field==='stop'?'Stop loss':'Take profit')+ticks;
  }
  return qty+' · '+(item.side==='buy'?'Buy':'Sell')+' '+({limit:'limit',market:'market',stop:'stop',stop_limit:field==='trigger'?'stop trigger':'stop limit'}[item.kind]||'limit');
}

export function draftTradingLevels(item,quote,amend,remove){
  const fields=[['entry',tradeColors[item.side]],['trigger',tradeColors.stop],['stop',tradeColors.stop],['target',tradeColors.target]];
  return fields.filter(([f])=>positive(item[f])&&(f!=='trigger'||item.kind==='stop_limit')).map(([field,color])=>({key:'draft'+field,field,price:Number(item[field]),label:bracketLabel(item,field,quote)+' · DRAFT',color,kind:'draft',item,amend:value=>amend(field,value),remove:()=>remove(field)}));
}
