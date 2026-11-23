import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, isOptOutMessage, isWithinServiceWindow, classifyInboundMessage, buildSafeReply, canAutoSend } from "../supabase/functions/zoz-whatsapp-control/policy.mjs";

test("normalizes only unambiguous E.164 phone numbers", () => {
  assert.equal(normalizePhone("+20 12 2274 8475"), "+201222748475");
  assert.equal(normalizePhone("abc"), "");
});
test("recognizes opt-out requests in Arabic and English", () => {
  assert.equal(isOptOutMessage("STOP"), true);
  assert.equal(isOptOutMessage("إلغاء"), true);
  assert.equal(isOptOutMessage("مرحباً"), false);
});
test("service window is limited to 24 hours", () => {
  const now = Date.parse("2026-11-23T12:00:00Z");
  assert.equal(isWithinServiceWindow("2026-11-23T11:59:00Z", now), true);
  assert.equal(isWithinServiceWindow("2026-11-22T11:59:00Z", now), false);
  assert.equal(isWithinServiceWindow("not-a-date", now), false);
});
test("sensitive subjects are escalated instead of auto-sent", () => {
  assert.equal(classifyInboundMessage("ممكن أعرف السعر؟").safeToAuto, false);
  assert.equal(classifyInboundMessage("عايز أقدم شكوى").escalate, true);
  assert.equal(classifyInboundMessage("السلام عليكم").safeToAuto, true);
});
test("safe replies stay within approved company facts", () => {
  assert.match(buildSafeReply("company_intro"), /أنظمة وحلول رقمية/);
  assert.doesNotMatch(buildSafeReply("company_intro"), /سعر|ضمان|موعد تسليم/);
});
test("auto-send fails closed whenever a safety gate is missing", () => {
  const base = { enabled:true, emergencyStop:false, mode:"safe_auto", safeToAuto:true, optedOut:false, excluded:false, automatedReplyAllowed:true, serviceWindowOpen:true, freeQuotaAvailable:true };
  assert.equal(canAutoSend(base), true);
  assert.equal(canAutoSend({...base, emergencyStop:true}), false);
  assert.equal(canAutoSend({...base, serviceWindowOpen:false}), false);
  assert.equal(canAutoSend({...base, freeQuotaAvailable:false}), false);
  assert.equal(canAutoSend({...base, optedOut:true}), false);
});
