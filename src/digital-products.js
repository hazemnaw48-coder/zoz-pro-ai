export const DIGITAL_PRODUCT_STATUSES=["idea","validation","outline","production","review","ready","launched","paused"];
const FORMATS=new Set(["ebook","course","template","toolkit","software","other"]);
const clean=(value,max=2000)=>String(value??"").trim().slice(0,max);
export function normalizeDigitalProductInput(body={}) {
 const name=clean(body.name,160), audience=clean(body.audience,500), problem=clean(body.problem,1000);
 if(!name||!audience||!problem) throw new Error("Product name, target audience, and customer problem are required.");
 const format=FORMATS.has(body.format)?body.format:"other";
 const rawPrice=body.price===""||body.price==null?null:Number(body.price);
 if(rawPrice!==null&&(!Number.isFinite(rawPrice)||rawPrice<0||rawPrice>100000000)) throw new Error("Price must be a non-negative number.");
 const now=new Date().toISOString();
 return {id:"DP-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),name,audience,problem,promise:clean(body.promise,1000),format,price:rawPrice,currency:body.currency==="USD"?"USD":"EGP",validationNotes:clean(body.validationNotes,3000),outline:clean(body.outline,6000),deliveryPlan:clean(body.deliveryPlan,2000),status:"idea",createdAt:now,updatedAt:now};
}
export function updateDigitalProductStatus(product,status) {
 if(!DIGITAL_PRODUCT_STATUSES.includes(status)) throw new Error("Invalid digital product status.");
 product.status=status; product.updatedAt=new Date().toISOString(); return product;
}