# Isolated NVIDIA Auto Ontology experiment

The experimental patch and control scripts here diagnose the synthetic SQLite fixture outside the WebCAD product runtime. They do not replace the upstream release or authorize production document transfer.

Upstream: NVIDIA/auto-ontology, inspected revision `c447003f72a822301e927196a4ecb5b597c308d5`.

Source: https://github.com/NVIDIA/auto-ontology/tree/c447003f72a822301e927196a4ecb5b597c308d5

Upstream code is copyright NVIDIA CORPORATION & AFFILIATES, licensed under Apache-2.0. The accompanying `LICENSE-NVIDIA` preserves the upstream license/notice. `isolated-nvidia.patch` and `prepare_patch.py` record local experiment changes; they are not an official NVIDIA patch.

See `docs/verification/AUTO-ONTOLOGY-SQL-ISOLATION-01-2026-11-07.md` and `AUTO-ONTOLOGY-JOIN-01-2026-11-07.md` for actual results and limitations. Runtime credentials, model files, private `.env`, Docker volumes and development logs are excluded.
