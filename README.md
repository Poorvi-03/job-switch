# Job Switch

MIT-licensed job shortlist, application tracker, and interview prep app. Plain HTML,
CSS and JavaScript. No dependency installation, account, backend, or API key.

## Run locally

From this directory, run `python -m http.server 8000 --bind 127.0.0.1`
and open http://localhost:8000. The separate standalone HTML can be opened directly
in a browser that supports local HTML and local storage.

## Install on Android

Publish the contents of this directory to an HTTPS static host. GitHub Pages is
available through GitHub Free for public repositories. Keep your resume, backups
and other personal data out of the repository. On the phone, open the deployed
URL in Chrome and choose **Add to Home screen** or **Install app** from its menu.
After the app shell finishes downloading, saved jobs and prep work offline. Job
links and refreshing the employer board require internet access.

## Workflow

1. Add your profile, preferred locations, approved answers and skills.
2. Paste any listing or load openings from a known Greenhouse employer board.
3. Open a saved job, review skill matches, and copy its application pack.
4. Apply on the employer site. Record the resume version and confirmation in the tracker.
5. Add practice tasks from the gaps on the Prep screen. Export a backup before
   moving phones or clearing browser data.

Data stays in browser storage. There is no sync, scheduled search, automated
submission or message delivery. The Greenhouse lookup contacts Greenhouse
directly and sends the board identifier, without sending your profile.

## Daily shortlist

Paste a CSV or JSON batch under **Import a ranked shortlist**, or select a CSV
exported from Excel. Preview shows new jobs, duplicates and invalid rows before
saving. Existing statuses and notes are preserved. Posting dates can be exact,
relative or Unknown. A job's source link and recommended first move are required.

CSV headers:
```
rank,title,company,location,employment_type,salary,posting_date,posting_source_url,first_seen,last_checked,req_id,source_url,official_url,required_skills,fit,gap,evidence,best_move,move_reason,referral_name,referral_url,referral_relationship,referral_draft,email,email_source_url,email_subject,email_draft
```

A JSON batch has a `batch_date` in YYYY-MM-DD format and a `jobs` array. Supported
first moves are Company careers site, LinkedIn Apply, LinkedIn referral, Email,
and Verify eligibility. Use the Answer Bank to copy each saved field individually.

## Optional automatic inbox

Cloudflare Worker source and schema are in `inbox/`. Create a D1 database on
the free plan, set its ID in wrangler.toml, and apply schema.sql. Put separate
random 32+ character secrets in READ_KEY and WRITE_KEY through Wrangler or the
Cloudflare dashboard. Deploy the Worker and connect its HTTPS /shortlist URL
and read key in the phone app. Change the allowed origin in worker.mjs if you
host the frontend elsewhere.

Configure a private GPT Action to POST the JSON batch to /shortlist with an
Authorization bearer header using the write key. GET uses a separate read key.
The inbox stores the latest batch of public job research. Keep personal answers,
private connection exports and resumes out of the payload. This optional backend
requires separate provisioning before the app can sync automatically.
