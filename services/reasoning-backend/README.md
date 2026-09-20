# Remote Reasoning Backend & Model Adapters

> 📌 **Mandatory Note for AI Agents**: Read [`../../AGENTS.md`](../../AGENTS.md) and [`../../to-do.md`](../../to-do.md) first before modifying reasoning or adapter logic.

This service defines the remote reasoning boundary, model adapters, and payload firewalls for the Privacy-Preserving Browser Agent.

---

## Key Responsibilities

1. **Recursive Payload Security Firewall (`payload-validator.js`)**:
   - Inspects incoming requests recursively.
   - Strictly rejects any payload containing raw credit card numbers, passwords, emails, raw DOM strings, or image pixel buffers.
2. **Response Schema Validator (`response-validator.js`)**:
   - Enforces valid action proposal schemas (`CLICK`, `TYPE`, etc.) targeting opaque element IDs (`el_1`, `el_2`, ...).
   - Rejects script injection attempts, arbitrary code execution, and invalid URL protocols.
3. **Model Provider Adapters (`model-provider.js`)**:
   - **Hugging Face Serverless**: Visual agent adapter using `Qwen/Qwen3-VL-4B-Instruct`.
   - **OpenRouter Free Tier**: Supports free vision and reasoning models (`qwen/qwen-2.5-vl-72b-instruct:free`, `google/gemma-2-9b-it:free`).
   - **Groq Fast Reasoning**: Supports fast Llama reasoning (`llama-3.3-70b-versatile`).
   - **Local Heuristic Planner**: 100% on-device offline reasoning with zero external API calls.
