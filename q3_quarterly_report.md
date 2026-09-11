# AcroTech Dynamics Inc. — Q3 Fiscal 2025 Quarterly Financial & Operations Report

**Reporting Period**: Three Months Ended September 30, 2025  
**Entity**: AcroTech Dynamics Inc. (Enterprise B2B SaaS & AI Automation)  
**Classification**: Official Management Discussion & Analysis (MD&A) and Financial Disclosures

---

## 1. Executive Summary & Financial Highlights

- **Annual Recurring Revenue (ARR)**: $184.5M (up +12.4% YoY from $164.2M, but showing marked deceleration from Q2's +22.0% YoY pace).
- **Q3 GAAP Revenue**: $48.20M (Subscription: $44.10M, Professional Services: $4.10M).
- **Gross Profit & Margin**: $32.95M (68.4% gross margin, compressed from 74.2% in Q3 FY24 due to a 38% increase in GPU hosting and model inference API costs).
- **Operating Loss (EBIT)**: -$4.75M (widened from -$0.95M in Q3 FY24).
- **Net Loss**: -$5.70M including $0.95M in debt service interest charges.
- **Cash & Equivalents**: $18.60M (decreased by $4.80M during the quarter).
- **Net Cash Runway**: ~3.87 quarters based on current operating burn rate ($4.80M/quarter).

---

## 2. Debt & Capital Structure

- **Senior Secured Term Facility**: $35.00M outstanding principal maturing in November 2026 (14 months remaining).
- **Financial Covenants**:
  - Maximum Senior Debt-to-ARR Covenant: **0.220x**.
  - Current Debt-to-ARR Ratio: **0.1897x** ($35.0M / $184.5M).
  - **Covenant Headroom**: 0.0303x ($5.6M ARR safety buffer before triggering loan acceleration or mandatory default).

---

## 3. Customer Concentration & Churn Exposure

- **Top 3 Customer Concentration**: 38.5% of total ARR ($71.03M).
- **Customer #1 (Global Logistics Enterprise)**:
  - Generates $29.90M ARR (16.2% of total company ARR).
  - Currently undergoing global enterprise vendor consolidation review with RFP expiring in Q1 FY26.
- **Net Revenue Retention (NRR)**: 101.2% (contracted from 114.5% YoY, reflecting reduced seat expansion and selective contract downsizings).

---

## 4. Key Risk Factors for Audit & Authentication

1. **RF-01: Liquidity Runway & Debt Covenant Headroom**:
   - Cash burn rate of $4.8M/quarter against an $18.6M cash reserve leaves less than 12 months of operational runway without outside financing or immediate cost curtailment.
   - Any deceleration of ARR below $159.1M would trigger an immediate debt covenant breach on the $35M senior facility.

2. **RF-02: Extreme Key Account Concentration**:
   - Churn from Customer #1 alone ($29.9M ARR) would cause an immediate 16.2% contraction in total ARR, dropping ending ARR to $154.6M, which would simultaneously breach the senior debt covenant.

3. **RF-03: Cloud & GPU Infrastructure Single Point of Failure (SPOF)**:
   - 92% of production workload resides in a single AWS availability zone (us-east-1) with asynchronous DR failover exceeding an 8-hour Recovery Time Objective (RTO).
   - Compute margins are vulnerable to upstream model API price escalations.

4. **RF-04: Unpatched High-Severity Telemetry Vulnerability**:
   - Internal audit identified an unpatched privilege escalation flaw in telemetry logging pipeline (CVE review pending), exposing tenant isolation boundaries.

5. **RF-05: Regulatory Exposure under EU AI Act**:
   - Autonomous inference features operating on European customer datasets require re-classification under EU AI Act Annex III by mid-2026, posing compliance penalty risks.
