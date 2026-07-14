# NiRM Knowledge Pool ("NiRM Brain") — Design Plan (2026-07-13)

Goal: brand-scoped, searchable LLM knowledge base inside NiRM so CS agents
get cited answers from brand documents (PDF, Excel, video) in Thai/English.

## Architecture
- Files: Supabase Storage, folder per brand (reuses NiRM brand list + roles).
- Extraction: PDF -> pdf.js text; Excel -> SheetJS rows; Video -> Whisper
  transcript with timestamps; scanned PDF -> OCR (phase 2).
- Index: chunk (~500 tokens, overlap) -> multilingual embeddings ->
  Supabase pgvector (SAME database). Hybrid search: vector + tsvector
  keyword, always filtered by brand_id (+ role/groupScope).
- Answering: Supabase Edge Function -> Claude API (Haiku) with top 5-8
  chunks -> answer + citations (file, page / sheet / video timestamp).
- UI: new "Knowledge" tab. Agent: search box + brand filter + answer with
  source cards + thumbs feedback. Manager: upload/manage files per brand,
  reindex button, unanswered-questions report.

## Data model
- kb_files(id, brand_id, type[pdf|xlsx|video], name, storage_path,
  status[processing|ready|error], uploaded_by, created_at)
- kb_chunks(id, file_id, brand_id, content, embedding vector(1024),
  meta jsonb {page|sheet|row|t_start}, tsv tsvector)
- kb_queries(id, agent, brand_id, question, answer, sources jsonb,
  rating, created_at)

## Phases
1. MVP (2-3 sessions): PDF + Excel ingest, pgvector hybrid search,
   Claude-cited answers, Knowledge tab, manager upload. Thai + English.
2. Video (1-2 sessions): Whisper transcription pipeline (Edge Function or
   local batch via Desktop Commander), timestamped citations; OCR for
   scanned PDFs.
3. Ops: feedback loop, usage/unanswered analytics, Duoke canned-reply
   suggestions, SharePoint folder auto-sync.

## Keys & cost
- Anthropic + OpenAI(Whisper) keys live in Supabase Edge Function secrets,
  never in the client bundle.
- Estimates: embeddings ~1 THB / 100 pages; ~0.1-0.3 THB per question
  (Haiku); ~7 THB per 30-min video. Expected < 500 THB/month.

## Security
- Query path enforces brand scoping server-side (RLS on kb_chunks by
  brand_id against the caller's allowed brands).
- Upload manager-only; deletes behind confirm; files immutable otherwise.

## Open decisions for April
1. First 3 brands to pilot (suggest: one Nestle brand, Stiebel, Shiseido).
2. Where source files live today (SharePoint paths) for phase-3 sync.
3. OpenAI vs local whisper for video (cost vs setup).
