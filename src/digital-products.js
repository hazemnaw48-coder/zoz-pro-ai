export const DIGITAL_PRODUCT_STATUSES=["idea","validation","outline","production","review","ready","launched","paused"];
const FORMATS=new Set(["ebook","course","template","toolkit","software","other"]);
const VALIDATION_COUNT_FIELDS=[
  "interviewsCompleted","recentPainCount","workaroundCount","prototypeVolunteers",
  "substitutesReviewed","gapReports","gapExplainers","prototypeTesters",
  "workflowCompletions","repeatUsers","gapUsefulCount","qualifiedVisits",
  "qualifiedResponses","followUpConversations","priceInterestCount"
];
const DEFAULT_VALIDATION=Object.freeze({
  interviewsCompleted:0,recentPainCount:0,workaroundCount:0,prototypeVolunteers:0,
  substitutesReviewed:0,gapReports:0,gapExplainers:0,prototypeTesters:0,
  workflowCompletions:0,repeatUsers:0,gapUsefulCount:0,qualifiedVisits:0,
  qualifiedResponses:0,followUpConversations:0,priceInterestCount:0,evidenceNotes:""
});
const clean=(value,max=2000)=>String(value??"").trim().slice(0,max);
function normalizeValidation(input={},previous=DEFAULT_VALIDATION) {
  const source=input && typeof input==="object" ? input : {};
  const prior=previous && typeof previous==="object" ? previous : DEFAULT_VALIDATION;
  const next={};
  for (const field of VALIDATION_COUNT_FIELDS) {
    const value=source[field]===undefined ? (prior[field]??0) : source[field];
    const number=value===""||value===null ? 0 : Number(value);
    if (!Number.isSafeInteger(number)||number<0||number>1000000) {
      throw new Error(field+" must be a whole number from 0 to 1000000.");
    }
    next[field]=number;
  }
  next.evidenceNotes=clean(source.evidenceNotes===undefined ? prior.evidenceNotes : source.evidenceNotes,4000);
  const interviewFields=["recentPainCount","workaroundCount","prototypeVolunteers","gapReports","gapExplainers"];
  for (const field of interviewFields) {
    if (next[field]>next.interviewsCompleted) throw new Error(field+" cannot exceed interviewsCompleted.");
  }
  for (const field of ["workflowCompletions","repeatUsers","gapUsefulCount"]) {
    if (next[field]>next.prototypeTesters) throw new Error(field+" cannot exceed prototypeTesters.");
  }
  if (next.qualifiedResponses>next.qualifiedVisits) throw new Error("qualifiedResponses cannot exceed qualifiedVisits.");
  if (next.followUpConversations>next.qualifiedResponses) throw new Error("followUpConversations cannot exceed qualifiedResponses.");
  if (next.priceInterestCount>next.followUpConversations) throw new Error("priceInterestCount cannot exceed followUpConversations.");
  return next;
}
export function evaluateDigitalProductGates(input={}) {
  const v=normalizeValidation(input);
  const interviews=v.interviewsCompleted>=15&&v.recentPainCount>=8&&v.workaroundCount>=5&&v.prototypeVolunteers>=3;
  const competitiveGap=v.substitutesReviewed>=8&&v.gapReports>=5&&v.gapExplainers>=3;
  const prototype=v.prototypeTesters>=5&&v.workflowCompletions>=4&&v.repeatUsers>=3&&v.gapUsefulCount>=3;
  const responseRate=v.qualifiedVisits ? v.qualifiedResponses/v.qualifiedVisits : 0;
  const purchaseIntent=v.qualifiedVisits>=100&&responseRate>=0.08&&v.followUpConversations>=5&&v.priceInterestCount>=3;
  return {
    interviews:{passed:interviews,summary:"15 interviews; 8 recent problems; 5 workarounds/consequences; 3 volunteers"},
    competitiveGap:{passed:competitiveGap,summary:"8 substitutes reviewed; 5 report the same gap; 3 explain its workflow impact"},
    prototype:{passed:prototype,summary:"5+ testers; 4 workflow completions; 3 repeat users; 3 find the gap useful"},
    purchaseIntent:{passed:purchaseIntent,summary:"100 qualified visits; 8%+ qualified response; 5 follow-ups; 3 reasoned price signals"},
    responseRate,
    allPassed:interviews&&competitiveGap&&prototype&&purchaseIntent
  };
}
export function normalizeDigitalProductInput(body={}) {
 const name=clean(body.name,160), audience=clean(body.audience,500), problem=clean(body.problem,1000);
 if(!name||!audience||!problem) throw new Error("Product name, target audience, and customer problem are required.");
 const format=FORMATS.has(body.format)?body.format:"other";
 const rawPrice=body.price===""||body.price==null?null:Number(body.price);
 if(rawPrice!==null&&(!Number.isFinite(rawPrice)||rawPrice<0||rawPrice>100000000)) throw new Error("Price must be a non-negative number.");
 const now=new Date().toISOString();
 return {id:"DP-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),name,audience,problem,promise:clean(body.promise,1000),format,price:rawPrice,currency:body.currency==="USD"?"USD":"EGP",validationNotes:clean(body.validationNotes,3000),outline:clean(body.outline,6000),deliveryPlan:clean(body.deliveryPlan,2000),validation:normalizeValidation(body.validation),status:"idea",createdAt:now,updatedAt:now};
}
export function updateDigitalProductValidation(product,input={}) {
 if(!product||typeof product!=="object") throw new Error("digital product is required.");
 product.validation=normalizeValidation(input,product.validation);
 product.updatedAt=new Date().toISOString();
 return product.validation;
}
export function updateDigitalProductStatus(product,status) {
 if(!DIGITAL_PRODUCT_STATUSES.includes(status)) throw new Error("Invalid digital product status.");
 const gates=evaluateDigitalProductGates(product?.validation);
 if(status==="ready"&&!gates.allPassed) throw new Error("Product cannot be marked ready until all customer-validation gates pass.");
 if(status==="launched"&&product.status!=="ready") throw new Error("Product must be ready before its status can be changed to launched.");
 product.status=status; product.updatedAt=new Date().toISOString(); return product;
}
