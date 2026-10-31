export const MARKET_GEOMETRY_CATALOG_ORIGIN='market-geometry-catalog-v1';
const origins=new Map();
const ORIGIN_LIMIT=128;
export const isMarketGeometryCatalogOrigin=value=>value===MARKET_GEOMETRY_CATALOG_ORIGIN;
export function markMarketGeometryCatalogOrigin(id,value=MARKET_GEOMETRY_CATALOG_ORIGIN){
 if(typeof id!=='string'||!isMarketGeometryCatalogOrigin(value))return null;
 origins.delete(id);origins.set(id,value);
 while(origins.size>ORIGIN_LIMIT)origins.delete(origins.keys().next().value);
 return value;
}
export function marketGeometryCatalogOrigin(id,value=null){
 if(isMarketGeometryCatalogOrigin(value))return markMarketGeometryCatalogOrigin(id,value);
 return typeof id==='string'&&isMarketGeometryCatalogOrigin(origins.get(id))?origins.get(id):null;
}
