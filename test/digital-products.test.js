import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDigitalProductInput,
  updateDigitalProductStatus,
  updateDigitalProductValidation,
  evaluateDigitalProductGates,
  DIGITAL_PRODUCT_STATUSES
} from "../src/digital-products.js";

test("digital product requires name, audience and customer problem",()=>{assert.throws(()=>normalizeDigitalProductInput({name:"",audience:"creators",problem:"save time"}),/required/);});
test("digital product does not invent a price and starts with empty validation evidence",()=>{
  const p=normalizeDigitalProductInput({name:"Creator Kit",audience:"new creators",problem:"don't know what to publish",format:"template"});
  assert.equal(p.price,null);assert.equal(p.currency,"EGP");assert.equal(p.status,"idea");assert.ok(DIGITAL_PRODUCT_STATUSES.includes(p.status));
  assert.equal(p.validation.interviewsCompleted,0);assert.equal(p.validation.evidenceNotes,"");
});
test("price and status are validated",()=>{
  assert.throws(()=>normalizeDigitalProductInput({name:"Kit",audience:"creators",problem:"planning",price:-1}),/Price/);
  const p=normalizeDigitalProductInput({name:"Kit",audience:"creators",problem:"planning"});
  assert.throws(()=>updateDigitalProductStatus(p,"paid"),/Invalid digital product status/);
  updateDigitalProductStatus(p,"validation");assert.equal(p.status,"validation");
});
test("validation progress must be non-negative integer counts with consistent totals",()=>{
  const p=normalizeDigitalProductInput({name:"Kit",audience:"creators",problem:"rights tracking"});
  assert.throws(()=>updateDigitalProductValidation(p,{interviewsCompleted:1,recentPainCount:2}),/cannot exceed/);
  assert.throws(()=>updateDigitalProductValidation(p,{interviewsCompleted:1.5}),/whole number/);
  assert.throws(()=>updateDigitalProductValidation(p,{qualifiedVisits:10,qualifiedResponses:11}),/cannot exceed/);
});
test("all validation gates remain closed until real evidence meets the thresholds",()=>{
  const p=normalizeDigitalProductInput({name:"Kit",audience:"creators",problem:"rights tracking"});
  assert.equal(evaluateDigitalProductGates(p.validation).allPassed,false);
  assert.throws(()=>updateDigitalProductStatus(p,"ready"),/validation gates/);
});
test("all four validation gates can pass and only then can product become ready",()=>{
  const p=normalizeDigitalProductInput({name:"Kit",audience:"creators",problem:"rights tracking"});
  updateDigitalProductValidation(p,{
    interviewsCompleted:15,recentPainCount:8,workaroundCount:5,prototypeVolunteers:3,
    substitutesReviewed:8,gapReports:5,gapExplainers:3,
    prototypeTesters:5,workflowCompletions:4,repeatUsers:3,gapUsefulCount:3,
    qualifiedVisits:100,qualifiedResponses:8,followUpConversations:5,priceInterestCount:3
  });
  assert.equal(evaluateDigitalProductGates(p.validation).allPassed,true);
  updateDigitalProductStatus(p,"ready");assert.equal(p.status,"ready");
  updateDigitalProductStatus(p,"launched");assert.equal(p.status,"launched");
});
