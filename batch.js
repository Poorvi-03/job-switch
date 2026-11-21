"use strict";

const batchColumns = [
  "rank", "title", "company", "location", "employment_type", "salary", "posting_date",
  "posting_source_url", "first_seen", "last_checked", "req_id", "source_url", "official_url",
  "required_skills", "fit", "gap", "evidence", "best_move", "move_reason", "action_url",
  "referral_name", "referral_url", "referral_relationship", "referral_draft",
  "email", "email_source_url", "email_subject", "email_draft"
];
const batchMoves = ["Company careers site", "LinkedIn Apply", "LinkedIn referral", "Email", "Verify eligibility"];
function readCsv(input) {
  const rows = [];
  const pattern = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|\n|\r|$)/y;
  let row = [];
  let offset = 0;
  while (offset < input.length) {
    pattern.lastIndex = offset;
    const matched = pattern.exec(input);
    if (!matched || pattern.lastIndex === offset) throw new Error("Invalid CSV near row " + (rows.length + 1));
    offset = pattern.lastIndex;
    row.push(matched[1] == null ? matched[2] : matched[1].replaceAll('""','"'));
    if (matched[3] !== ",") { rows.push(row); row = []; }
  }
  if (row.length) rows.push([...row,""]);
  const headers = rows.shift()?.map(value => value.trim().toLowerCase().replace(/ +/g,"_")) ?? [];
  if (!headers.includes("title") || !headers.includes("source_url") || new Set(headers).size !== headers.length) {
    throw new Error("Use the Job Switch CSV headers, including title and source_url.");
  }
  return rows.filter(values => values.some(value => value.trim())).map(values =>
    values.length !== headers.length ? null : Object.fromEntries(headers.map((header,index) => [header,values[index]])));
}
function getBatch(input) {
  const value = input.trim();
  if (!value || value.length > 750000) throw new Error("Enter a shortlist under 750 KB.");
  if (value.startsWith("{")) return JSON.parse(value);
  return {batch_date:new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Kolkata"}), jobs:readCsv(value)};
}
function planBatch(batch, existing) {
  if (!batch || !/^\d{4}-\d{2}-\d{2}$/.test(batch.batch_date) ||
      !Array.isArray(batch.jobs) || batch.jobs.length < 1 || batch.jobs.length > 20) {
    throw new Error("A batch needs a YYYY-MM-DD date and 1 to 20 jobs.");
  }
  const jobs = [...existing];
  const rejected = [];
  let added = 0;
  let duplicates = 0;
  const canonical = value => http(value) ? identity(http(value)) : "";
  for (const [index,raw] of batch.jobs.entries()) {
    if (!raw || Object.values(raw).some(value => value !== null && !["number","string"].includes(typeof value))) {
      rejected.push("Row " + (index + 1) + " has invalid fields.");
      continue;
    }
    const data = Object.fromEntries(batchColumns.map(field => [field, clean(raw[field])]));
    const rank = Number(data.rank);
    const contact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) && http(data.email_source_url);
    if (!data.title || !data.company || !http(data.source_url) || !data.posting_date ||
        !batchMoves.includes(data.best_move) || !Number.isInteger(rank) || rank < 1 || rank > 20 ||
        data.best_move === "Company careers site" && !http(data.official_url) ||
        data.best_move === "LinkedIn referral" && !http(data.referral_url) ||
        data.best_move === "Email" && !contact) {
      rejected.push("Row " + (index + 1) + " needs a valid rank, title, company, source, posting date and recommended route.");
      continue;
    }
    if (!contact) data.email = "";
    data.action_url = {
      "Company careers site":data.official_url, "LinkedIn Apply":data.source_url,
      "LinkedIn referral":data.referral_url, "Verify eligibility":""
    }[data.best_move] ?? "";
    const references = [data.source_url,data.official_url].map(canonical).filter(Boolean);
    const match = jobs.some(job => {
      const sameReq = data.req_id && clean(job.req).toLowerCase() === data.req_id.toLowerCase() &&
        clean(job.company).toLowerCase() === data.company.toLowerCase();
      return sameReq || [job.url,job.research?.source_url,job.research?.official_url].some(url => references.includes(canonical(url)));
    });
    if (match) { duplicates++; continue; }
    jobs.push({id:crypto.randomUUID(), title:data.title, company:data.company, url:http(data.official_url) || http(data.source_url),
      req:data.req_id, location:data.location, type:["Permanent","Contract","Internship"].includes(data.employment_type) ? data.employment_type : "Unknown",
      posted:/^\d{4}-\d{2}-\d{2}$/.test(data.posting_date) ? data.posting_date : "", salary:data.salary,
      required:data.required_skills, status:"Shortlisted", next:"", proof:"", resumeUsed:"",
      research:{...data, rank, batchDate:batch.batch_date}});
    added++;
  }
  return {jobs, added, duplicates, rejected};
}
async function unpackProfile(envelope, token) {
  if (!envelope || typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") return null;
  const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const key = await crypto.subtle.importKey("raw",digest,"AES-GCM",false,["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(envelope.iv)},key,decode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
function setupBatchImport() {
  const form = $("batchForm");
  const preview = $("batchPreview");
  function showPreview(batch) {
    const plan = planBatch(batch,state.jobs);
    preview.replaceChildren();
    node("p", plan.added + " new · " + plan.duplicates + " already saved · " + plan.rejected.length + " need fixing", preview);
    for (const error of plan.rejected) node("p",error,preview);
    if (plan.added) button(preview,"Import " + plan.added + " jobs", () => {
      const latest = planBatch(batch,state.jobs);
      if (save({...state,jobs:latest.jobs},"Imported " + latest.added + " new jobs.")) preview.replaceChildren();
    });
  }
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      const file = $("batchFile").files[0];
      if (file?.size > 750000) throw new Error("Choose a file under 750 KB.");
      const input = form.elements.batch.value.trim() || (file ? await file.text() : "");
      showPreview(getBatch(input));
    } catch (error) { preview.replaceChildren(); node("p",error.message,preview); }
  };
  const settingsKey = "job-switch-inbox-v1";
  const inbox = $("inboxForm");
  const syncState = $("syncState");
  let settings;
  try { settings = JSON.parse(localStorage.getItem(settingsKey)); } catch {}
  let running = false;
  async function sync() {
    if (!settings || running) return;
    const target = settings;
    running = true;
    syncState.textContent = "Checking inbox…";
    try {
      const response = await fetch(target.url,{headers:{Authorization:"Bearer " + target.token},
        cache:"no-store", signal:AbortSignal.timeout(12000)});
      if (target !== settings) return;
      if (response.status === 204) { syncState.textContent = "Connected. No batch has arrived yet."; return; }
      if (!response.ok) throw new Error("Check the inbox URL and read key.");
      const payload = await response.json();
      const seed = await unpackProfile(payload.private_profile,target.token).catch(() => null);
      if (target !== settings) return;
      const plan = planBatch(payload,state.jobs);
      if (plan.rejected.length) throw new Error("The inbox returned an invalid batch.");
      const profile = {...state.profile};
      let filled = 0;
      if (seed) for (const field of $("profileForm").elements) {
        const key = field.name;
        const value = seed[key];
        if (!key || (typeof value !== "string" && typeof value !== "boolean")) continue;
        if (profile[key] !== undefined && profile[key] !== "") continue;
        profile[key] = value;
        filled++;
      }
      if ((plan.added || filled) && !save({...state,profile,jobs:plan.jobs},
          filled ? "Profile and Answer Bank updated." : "New shortlist received.")) {
        throw new Error("Browser storage is unavailable.");
      }
      if (filled) fillProfile();
      syncState.textContent = plan.added ? "Synced " + plan.added + " new jobs." : "Connected. Latest batch already saved.";
    } catch (error) {
      if (target === settings) syncState.textContent = "Sync failed. " + error.message;
    } finally {
      running = false;
      if (settings && target !== settings) sync();
    }
  }
  if (settings) {
    inbox.elements.url.value = settings.url;
    inbox.elements.token.value = settings.token;
    sync();
  }
  inbox.onsubmit = event => {
    event.preventDefault();
    const {url,token} = formData(inbox);
    if (!http(url).startsWith("https://") || !/^[a-zA-Z0-9_-]{32,128}$/.test(token)) {
      syncState.textContent = "Use the HTTPS inbox URL and its read key."; return;
    }
    settings = {url:http(url),token};
    try { localStorage.setItem(settingsKey,JSON.stringify(settings)); }
    catch { syncState.textContent = "Could not store inbox settings on this device."; return; }
    sync();
  };
  $("disconnect").onclick = () => {
    settings = null; localStorage.removeItem(settingsKey); inbox.reset();
    syncState.textContent = "Inbox not connected.";
  };
  document.addEventListener("visibilitychange",() => { if (!document.hidden) sync(); });
}
