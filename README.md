# Automation for Criteria 4

## Implemented architecture

- React/Vite frontend and Express REST backend
- MongoDB models for users, batches, students, final results, and audit logs
- USN identity policy: one normalized uppercase USN is unique across the entire database
- Server-side result computation pairs semesters (1-2, 3-4, 5-6, 7-8)
- FinalResult is authoritative for success-rate reports; student fallback is shown with provenance
- Offer letters are limited to 2 MB and PDF/JPEG/PNG files

## Running locally

1. Copy `backend/.env.example` to `backend/.env` and set a strong `JWT_SECRET` and MongoDB URI.
2. `cd backend && npm install && npm run dev`
3. `cd frontend && npm install && npm run dev`
4. Create the first admin with `POST /api/auth/register` once, then log in.

## Required report behavior

- LYG = selected graduation year; LYGM1 = LYG - 1; LYGM2 = LYG - 2
- Without-backlog SI = Y / X, where Y is a final-result Pass
- Stipulated-period SI = Y / X, where Y is a Pass or backlog-cleared Yes
- Assessment scores from the report: 25 x average SI without backlog and 15 x average SI stipulated
- Official formulas and summary figures are retained in FinalResult documents; no fallback values are mixed into an official record
