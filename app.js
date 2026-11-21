"use strict";
const $ = id => document.getElementById(id);
const statuses = ["Saved", "Shortlisted", "In progress", "Needs input", "Verify submission", "Submitted", "Interview", "Closed"];
const key = "job-switch-v1";
const words = text => text.toLowerCase().split(/[\n,]+/).map(word => word.trim()).filter(Boolean);
const clean = value => String(value ?? "").trim();
const formData = form => Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, clean(value)]));
const http = value => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
};
const identity = value => {
  const url = new URL(value);
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (/^(utm_|trk$|ref$|source$)/i.test(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  return url.href;
};
const node = (tag, value, parent) => {
  const element = document.createElement(tag);
  if (value != null) element.textContent = value;
  if (parent) parent.append(element);
  return element;
};
const button = (parent, label, run) => {
  const element = node("button", label, parent);
  element.type = "button";
  element.addEventListener("click", run);
  return element;
};
function link(parent, label, value) {
  const url = http(value);
  if (!url) return;
  const element = node("a", label, parent);
  element.href = url;
  element.target = "_blank";
  element.rel = "noopener noreferrer";
}
const initial = {profile:{}, jobs:[], prep:[]};
let state = structuredClone(initial);
try { state = JSON.parse(localStorage.getItem(key)) ?? state; } catch { notify("Saved data could not be read."); }
function notify(message) { $("notice").textContent = message; }
function save(next, message) {
  try { localStorage.setItem(key, JSON.stringify(next)); } catch {
    notify("Could not save. Browser storage may be full or unavailable.");
    return false;
  }
  state = next;
  notify(message);
  render();
  return true;
}
function updateJob(job) {
  const jobs = state.jobs.some(item => item.id === job.id)
    ? state.jobs.map(item => item.id === job.id ? job : item)
    : [...state.jobs, job];
  return save({...state, jobs}, "Job saved.");
}
function addJob(data) {
  if (!http(data.url)) return notify("Enter a valid HTTP or HTTPS job link.");
  const duplicate = state.jobs.find(job => job.id !== data.id && (
    identity(job.url) === identity(data.url) ||
    data.req && job.req.toLowerCase() === data.req.toLowerCase() && job.company.toLowerCase() === data.company.toLowerCase()
  ));
  if (duplicate) return notify("Already saved: " + duplicate.title + " at " + duplicate.company);
  const previous = state.jobs.find(job => job.id === data.id);
  return updateJob({...previous, ...data, id: previous?.id ?? crypto.randomUUID(),
    status: previous?.status ?? "Saved", next: previous?.next ?? "", proof: previous?.proof ?? "",
    resumeUsed: previous?.resumeUsed ?? ""});
}
function fit(job) {
  const profile = state.profile;
  const required = [...new Set(words(job.required))];
  const skills = words(profile.skills ?? "");
  const locations = words(profile.locations ?? "");
  const matched = required.filter(skill => skills.includes(skill));
  const gaps = required.filter(skill => !skills.includes(skill));
  const excluded = words(profile.excluded ?? "").includes(job.company.toLowerCase());
  const wrongType = profile.permanent && ["Contract", "Internship"].includes(job.type);
  const matchesLocation = locations.some(location => job.location.toLowerCase().includes(location));
  return {matched, gaps, excluded, wrongType, matchesLocation,
    score: excluded || wrongType ? -100 : matched.length - gaps.length + (matchesLocation ? 2 : 0) + (job.type === "Permanent" ? 1 : 0)};
}
function answers() {
  const p = state.profile;
  return [["Name",p.name],["Current role",p.role],["Current company",p.employer],
    ["Education",p.education],["Employment history",p.employment],["Fixed pay",p.fixedPay],
    ["Variable pay",p.variablePay],["Current total compensation",p.salary],["Expected compensation",p.target],
    ["Notice period",p.noticePeriod],["Skills",p.skills],["Project examples",p.summary],
    ["Approved screening answers",p.answers],["Resume link",p.resume]].filter(([,value]) => value);
}
function copyText(value, label) {
  navigator.clipboard.writeText(value).then(() => notify(label + " copied."),
    () => notify("Copy the text directly from the app."));
}
function renderAnswers() {
  const list = $("answerList");
  list.replaceChildren();
  if (!answers().length) node("p", "Add your details in Profile to start.", list);
  for (const [label,value] of answers()) {
    const card = node("article", null, list);
    node("h3", label, card);
    node("p", value, card).style.whiteSpace = "pre-wrap";
    button(card, "Copy " + label, () => copyText(value,label));
  }
}
function applicationPack(job) {
  const p = state.profile;
  return answers().map(([label, value]) => label + "\n" + value).concat(
    ["\nReferral draft\nHi [Name], I'm interested in " + job.title + " at " + job.company +
    (job.req ? " (" + job.req + ")" : "") + "." +
    (p.role && p.employer ? " I work as " + p.role + " at " + p.employer + "." : "") +
    (p.summary ? " " + p.summary : "") +
    " Would you be comfortable referring me? " + job.url + "\nThanks" + (p.name ? ",\n" + p.name : "!")]
  ).join("\n\n");
}
function renderJobs() {
  const list = $("jobsList");
  list.replaceChildren();
  const query = $("query").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const jobs = state.jobs.map(job => ({job, fit:fit(job)}))
    .filter(({job}) => (!status || job.status === status) &&
      [job.title, job.company, job.location, job.req].join(" ").toLowerCase().includes(query))
    .sort((a,b) => {
      const left = a.job.research;
      const right = b.job.research;
      if (left && right) return right.batchDate.localeCompare(left.batchDate) || left.rank - right.rank;
      if (left || right) return left ? -1 : 1;
      return b.fit.score - a.fit.score || b.job.posted.localeCompare(a.job.posted);
    });
  if (!jobs.length) node("p", "No matching saved jobs. Add a link or load an employer board.", list);
  for (const {job,fit:match} of jobs) {
    const card = node("article", null, list);
    node("h3", job.title, card);
    node("p", [job.company, job.location || "Location unconfirmed", job.type, job.salary, job.posted && "Posted " + job.posted].filter(Boolean).join(" · "), card);
    const explanation = [
      match.excluded && "Excluded company", match.wrongType && "Outside permanent-only preference",
      match.matchesLocation && "Location keyword match",
      match.matched.length && "Skills matched: " + match.matched.join(", "),
      match.gaps.length && "Skills to review: " + match.gaps.join(", ")
    ].filter(Boolean);
    node("p", explanation.join(" · ") || "Add required skills and check location and eligibility.", card).className = "fit";
    const research = job.research;
    if (research) {
      node("p", "Posted " + (research.posting_date || "Unknown") +
        (research.last_checked ? " · Checked " + research.last_checked : ""), card);
      node("h3", research.best_move, card);
      if (research.first_seen) node("p", "First seen " + research.first_seen, card);
      if (research.move_reason) node("p", research.move_reason, card);
      if (research.fit) node("p", research.fit, card);
      if (research.gap) node("p", "Gap to check: " + research.gap, card);
      if (research.evidence) node("p", "Lead with: " + research.evidence, card);
      const sources = node("div", null, card);
      sources.className = "actions";
      link(sources, "Company careers", research.official_url);
      link(sources, "Posting date source", research.posting_source_url);
      link(sources, "Original listing", research.source_url);
      if (research.referral_url || research.email || research.referral_draft) {
        const outreach = node("details", null, card);
        node("summary", "Referral and recruiter outreach", outreach);
        link(outreach, research.referral_name || "LinkedIn profile", research.referral_url);
        if (research.referral_relationship) node("p", research.referral_relationship, outreach);
        for (const [label,value] of [["Referral note",research.referral_draft],["Recruiting email",research.email],
          ["Subject",research.email_subject],["Email draft",research.email_draft]]) {
          if (!value) continue;
          node("p", label + "\n" + value, outreach).style.whiteSpace = "pre-wrap";
          button(outreach,"Copy " + label.toLowerCase(),() => copyText(value,label));
        }
        link(outreach, "Email source", research.email_source_url);
      }
    }
    const actions = node("div", null, card);
    actions.className = "actions";
    link(actions, research?.action_url ? "Open recommended route" : "Open listing", research?.action_url || job.url);
    if (research?.best_move === "Email" && research.email) {
      button(actions, "Copy email draft", () => copyText([research.email, research.email_subject,
        research.email_draft].filter(Boolean).join("\n\n"), "Email draft"));
    }
    button(actions, "Edit job", () => {
      const form = $("jobForm");
      for (const element of form.elements) if (element.name) element.value = job[element.name] ?? "";
      form.parentElement.open = true;
      form.scrollIntoView({block:"start"});
      form.elements.title.focus();
    });
    const details = node("details", null, card);
    node("summary", job.status + " · Application details", details);
    const form = node("form", null, details);
    const status = node("select", null, node("label", "Status", form));
    statuses.forEach(value => node("option", value, status));
    status.value = job.status;
    const next = node("input", null, node("label", "Next action or follow-up date", form));
    next.value = job.next;
    const proof = node("input", null, node("label", "Confirmation reference or evidence link", form));
    proof.value = job.proof;
    const version = node("input", null, node("label", "Resume version used", form));
    version.value = job.resumeUsed;
    version.placeholder = state.profile.resumeVersion || "Resume version";
    node("button", "Save application update", form).type = "submit";
    form.onsubmit = event => {
      event.preventDefault();
      if (status.value === "Submitted" && !proof.value.trim()) {
        proof.setCustomValidity("Enter a confirmation reference before marking submitted.");
        proof.reportValidity();
        return;
      }
      updateJob({...job, status:status.value, next:next.value.trim(), proof:proof.value.trim(), resumeUsed:version.value.trim()});
    };
    proof.oninput = () => proof.setCustomValidity("");
    status.onchange = () => proof.setCustomValidity("");
    const pack = node("textarea", null, node("label", "Application answers and referral draft", details));
    pack.rows = 6;
    pack.value = applicationPack(job);
    button(details, "Copy application pack", async () => {
      try { await navigator.clipboard.writeText(pack.value); notify("Application pack copied."); }
      catch { pack.select(); notify("Select and copy the application pack."); }
    });
    button(details, "Remove job", () => {
      if (confirm("Remove this job and its application record?")) save({...state, jobs:state.jobs.filter(item => item.id !== job.id)}, "Job removed.");
    });
  }
}
function renderPrep() {
  const gaps = $("gaps");
  gaps.replaceChildren();
  const skills = [...new Set(state.jobs.filter(job => job.status !== "Closed" && !fit(job).excluded && !fit(job).wrongType)
    .flatMap(job => fit(job).gaps))];
  if (skills.length) node("p", "Skills to review: " + skills.join(", "), gaps);
  const list = $("prepList");
  list.replaceChildren();
  for (const task of state.prep) {
    const card = node("article", null, list);
    node("h3", task.task, card);
    node("p", [task.done ? "Completed" : "To do", task.date].filter(Boolean).join(" · "), card);
    button(card, task.done ? "Reopen" : "Complete", () => save({...state,
      prep:state.prep.map(item => item.id === task.id ? {...item, done:!item.done} : item)}, "Practice task updated."));
    button(card, "Remove", () => save({...state, prep:state.prep.filter(item => item.id !== task.id)}, "Practice task removed."));
  }
}
function render() { renderJobs(); renderPrep(); renderAnswers(); }
function fillProfile() {
  for (const field of $("profileForm").elements) {
    if (field.type === "checkbox") field.checked = Boolean(state.profile[field.name]);
    else if (field.name) field.value = state.profile[field.name] ?? "";
  }
}
for (const tab of document.querySelectorAll("[data-tab]")) {
  tab.onclick = () => {
    for (const other of document.querySelectorAll("[data-tab]")) {
      other.setAttribute("aria-selected", String(tab === other));
      $(other.dataset.tab).hidden = tab !== other;
    }
  };
}
for (const value of statuses) node("option", value, $("statusFilter"));
$("statusFilter").onchange = renderJobs;
$("query").oninput = renderJobs;
$("jobForm").onsubmit = event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (addJob(formData(form))) {
    form.reset();
    form.elements.id.value = "";
    form.parentElement.open = false;
  }
};
$("profileForm").onsubmit = event => {
  event.preventDefault();
  const form = event.currentTarget;
  const profile = {...formData(form), permanent:form.elements.permanent.checked};
  if (profile.resume && !http(profile.resume)) return notify("Enter a valid HTTP or HTTPS resume link.");
  save({...state, profile}, "Profile saved.");
};
$("prepForm").onsubmit = event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  if (data.task && save({...state, prep:[...state.prep, {...data, id:crypto.randomUUID(), done:false}]}, "Practice task added.")) form.reset();
};
$("feedForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const {board, query} = formData(form);
  const token = board.replace(/^https?:\/\//i, "").replace(/^(job-boards(?:\.eu)?|boards)\.greenhouse\.io\//i, "").split(/[/?#]/)[0];
  const list = $("feed");
  list.replaceChildren();
  if (!/^[a-z0-9_-]+$/i.test(token)) return node("p", "Enter a Greenhouse board name or URL.", list);
  const submit = form.querySelector("button");
  submit.disabled = true;
  node("p", "Loading openings…", list);
  try {
    const domain = /^(?:https?:\/\/)?job-boards\.eu\.greenhouse\.io\//i.test(board) ? "boards-api.eu.greenhouse.io" : "boards-api.greenhouse.io";
    const response = await fetch("https://" + domain + "/v1/boards/" + token + "/jobs", {signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error("Board unavailable");
    const data = await response.json();
    const queries = words(query);
    const matches = data.jobs.filter(job => http(job.absolute_url) &&
      (!queries.length || queries.some(term => job.title.toLowerCase().includes(term))));
    list.replaceChildren();
    node("p", matches.length ? "Showing " + Math.min(matches.length, 30) + " of " + matches.length + " matches." : "No matching openings.", list);
    for (const item of matches.slice(0, 30)) {
      const card = node("article", null, list);
      node("h3", item.title, card);
      node("p", item.location?.name || "Location unconfirmed", card);
      link(card, "View listing", item.absolute_url);
      button(card, "Save opening", () => {
        if (addJob({title:item.title, url:item.absolute_url, company:item.company_name || token,
          req:String(item.requisition_id || item.id), location:item.location?.name || "", type:"Unknown",
          required:"", salary:"", posted:item.first_published?.slice(0,10) || ""})) {
          card.querySelector("button").disabled = true;
        }
      });
    }
  } catch { list.replaceChildren(); node("p", "Could not load this board. Check the name and your connection, or add the job manually.", list); }
  finally { submit.disabled = false; }
};
function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], {type}));
  const anchor = node("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("exportJson").onclick = () => download("job-switch-backup.json", JSON.stringify(state, null, 2), "application/json");
$("exportCsv").onclick = () => {
  const fields = ["title","company","url","req","location","type","posted","salary","required","status","next","proof","resumeUsed"];
  const cell = value => {
    const text = clean(value);
    return '"' + (/^[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"','""') + '"';
  };
  download("job-switch-jobs.csv", [fields.join(","), ...state.jobs.map(job => fields.map(field => cell(job[field])).join(","))].join("\r\n"), "text/csv");
};
$("importJson").onchange = async event => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("Too large");
    const data = JSON.parse(await file.text());
    const strings = (obj, keys) => obj && keys.every(field => typeof obj[field] === "string");
    const valid = data.profile && typeof data.profile === "object" && !Array.isArray(data.profile) &&
      Object.entries(data.profile).every(([key,value]) => typeof value === (key === "permanent" ? "boolean" : "string")) &&
      Array.isArray(data.jobs) && data.jobs.every(job => strings(job, ["id","title","company","url","req","location","type","posted","salary","required","status","next","proof","resumeUsed"]) && http(job.url) && statuses.includes(job.status)) &&
      Array.isArray(data.prep) && data.prep.every(task => strings(task, ["id","task","date"]) && typeof task.done === "boolean");
    if (!valid) throw new Error("Invalid backup");
    if (confirm("Replace the profile, jobs, and practice tasks on this device?") && save(data, "Backup restored.")) fillProfile();
  } catch { notify("This file is not a valid Job Switch backup."); }
  finally { input.value = ""; }
};
fillProfile();
render();
setupBatchImport();
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Offline setup failed", error));
}
