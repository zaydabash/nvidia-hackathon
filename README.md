# HealthBridge
> AI-powered healthcare navigation for the 25M+ uninsured Americans

**Built for the NVIDIA Agents for Impact Hackathon**

[![NVIDIA Nemotron](https://img.shields.io/badge/NVIDIA-Nemotron%2049B-76b900?style=flat&logo=nvidia)](https://build.nvidia.com)
[![Tavily Search](https://img.shields.io/badge/Search-Tavily-blue)](https://tavily.com)

---

## The Problem

1 in 10 Americans has no health insurance. When they get sick, they face a fragmented system of free clinics, sliding-scale programs, and financial assistance — all requiring hours of research to navigate.

**HealthBridge does it in 20 seconds.**

---

## What It Does

A true agentic AI that acts, not just talks:

1. Takes a health concern, location, and insurance status
2. **Runs 4 parallel web searches** for real local resources
3. Reasons over results using NVIDIA Nemotron 49B
4. **Streams a personalized action plan** with names, addresses, phone numbers
5. Generates a phone call script so users know exactly what to say
6. Answers follow-up questions in full context

---

## Features

- **Agentic search loop** — Parallel Tavily searches + NVIDIA NIM reasoning
- **Spanish support** — Full bilingual UI and AI responses
- **Voice input** — Web Speech API, no dependencies
- **Medicaid eligibility checker** — Instant check using 2024 FPL thresholds
- **Call script generator** — Personalized script for calling the clinic
- **Medication price lookup** — GoodRx, NeedyMeds, Cost Plus Drugs
- **Shareable plan link** — Base64-encoded URL, no backend needed
- **Crisis detection** — Real-time safety keyword detection with 988 hotline
- **PDF export** — Print-optimized action plan

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Model | NVIDIA Nemotron Super 49B via NIM API |
| Web Search | Tavily API (parallel queries) |
| Backend | Node.js + Express |
| Frontend | Vanilla HTML/CSS/JS (single file) |
| Voice | Web Speech API |

---

## NVIDIA Integration

```js
model: "nvidia/llama-3.3-nemotron-super-49b-v1"
baseURL: "https://integrate.api.nvidia.com/v1"
```

The agent runs a true tool-calling loop — Nemotron decides what to search, fires parallel queries, reasons over results, and streams the final plan.

---

## Setup

```bash
# Clone
git clone https://github.com/zaydabash/nvidia-hackathon.git
cd nvidia-hackathon

# Install
npm install

# Run (knowledge-only mode)
node server.js

# Run with real web search
TAVILY_KEY=tvly-yourkey node server.js
```

Open **http://localhost:3000**

### Required API Keys

| Key | Where to get it | Required? |
|-----|----------------|-----------|
| NVIDIA NIM | [build.nvidia.com](https://build.nvidia.com) | Yes |
| Tavily | [app.tavily.com](https://app.tavily.com) | For web search |

Add your NVIDIA key to `server.js` and run with your Tavily key as an env variable.

---

## Impact

- **25M+** uninsured Americans who need this
- **1,400+** federally funded clinics findable through HRSA
- **$0** cost to use HealthBridge
- **15M+** Spanish-speaking uninsured Americans served with bilingual support

---

## Project Structure

```
├── index.html     # Full frontend — UI, agent loop, all features
├── server.js      # Express server — parallel search, NVIDIA proxy
└── package.json
```

---

*Built with NVIDIA Nemotron · Agents for Impact Hackathon 2026*
