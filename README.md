# [Project Name]

> [One-line description of what this project does]

---

## Overview

[2-3 sentences describing the project, its purpose, and its users.]

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | [e.g., Next.js, React, SvelteKit] |
| Deployment | [e.g., Vercel] |
| Database | [e.g., Supabase (PostgreSQL)] |
| Auth | [e.g., Supabase Auth] |
| Storage | [e.g., Supabase Storage] |
| [Other] | [e.g., Resend for email] |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- [Other prerequisites]

### Installation

```bash
git clone <repo-url>
cd <project-name>
npm install
```

### Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

See `.env.example` for all required variables. **Never commit `.env`.**

### Development

```bash
npm run dev
```

---

## Project Structure

```
[Add directory tree once structure is established]
```

---

## Database

This project uses Supabase. Migrations are in `supabase/migrations/`.

```bash
# Apply migrations locally
supabase db reset

# Generate new migration
supabase migration new <name>
```

---

## Deployment

**Frontend (Vercel)**
- Connect the repository to Vercel
- Set environment variables in the Vercel dashboard
- Deploys automatically on push to `main`

**Database (Supabase)**
- Managed via Supabase dashboard
- Production migrations require explicit human approval before running

---

## Contributing

See `RULES.md` for collaboration protocol.

---

## Worklog

See `WORKLOG.md` for a full history of human requests and AI actions.
