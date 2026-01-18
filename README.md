# Project UNFORGIVEN // Protocol

> **"We don't block bots; we lock their liquidity into a 'Bankruptcy Zone'."**

## 1. Abstract
Current anti-scalping measures (KYC, CAPTCHA, Waiting Rooms) attempt to solve a mechanism design problem with identity verification. This is inefficient and prone to privacy backlash.

**Project UNFORGIVEN** proposes a market-based solution: **Identity-Weighted Access Pricing**. Instead of dynamic pricing which hurts fans, we utilize a dynamic **refundable pre-authorization** model. By turning capital lockup into a friction signal, we mathematically destroy the arbitrage ROI for mass bot attacks while keeping face-value prices fixed for real fans.

---

## 2. Core Mechanism: The $C_{access}$ Formula
Unlike traditional VRGDA which increases the *final price*, UNFORGIVEN utilizes a J-Curve to scale the **refundable pre-authorization amount ($D$)** required to access inventory.

$$C_{access} = P_0 + D(\alpha, t, \kappa)$$

### Variable Definitions:
* **$P_0$ (Fixed Face Value)**: The ticket price remains constant. We do not exploit fans with dynamic pricing.
* **$D$ (Refundable Capital Barrier)**: A temporary pre-authorization hold.
    * For a **True Fan** ($\alpha \to 1$), $D \approx 0$.
    * For a **Suspected Bot** ($\alpha \to 0$), $D$ scales exponentially.
* **$\alpha$ (Identity-Risk Factor)**: Derived from off-chain signals (e.g., Spotify listening history, on-chain reputation) via zero-knowledge proofs.
* **$t, \kappa$**: Time decay and network congestion constants.

**The Logic**: When demand spikes, the "Cost of Access" ($D$) rises sharply for low-reputation accounts. This forces scalpers into a **"Bankruptcy Zone"** where the capital required to sweep inventory exceeds the potential resale profit, causing the attack to collapse.

---

## 3. Technical Implementation
This protocol is architected for high-throughput chains like **Solana** or **Aptos** to handle bursty ticketing traffic.

### A. Hybrid Trust Architecture
* **Off-chain Engine**: Handles high-frequency scoring and queue management in milliseconds.
* **On-chain Settlement**: Executes the atomic swap of Ticket-for-Capital.

### B. Gas Optimization: Bitwise Compression
To ensure the "Audit Log" is affordable on-chain, we verify rules without storing PII.
* **Bitwise Packing**: We compress multiple verification flags (risk score, timestamp, outcome) into a single **256-bit word**.
* **Privacy-Preserving**: Only the cryptographic proof of the rule check is stored on-chain, ensuring transparency without doxxing fans.

---

## 4. Hackathon Implementation Plan
We are open-sourcing the core protocol logic for the **Consensus 2026 Hackathon**.

- [x] **Phase 0: Mathematical Proof (Completed)**
    - Validated the J-Curve Logic and Bankruptcy Zone parameters.
    - Completed Whitepaper v5.0 mechanism design.
- [ ] **Phase 1: Smart Contract Logic (In Progress)** 🟡
    - Fully implement `UnforgivenTicket.sol` with J-Curve and Scalper Tax.
    - **Goal**: Integrate Time Decay ($t$) factor and ZK-proof verification hooks during the hackathon.
- [ ] **Phase 2: Frontend Simulation**
    - Live visualization of the "Bankruptcy Zone" attacking bot wallets.
    - Interactive dashboard for organizers to view the "Confiscated Vault" growing.
- [ ] **Phase 3: "Shopify" Presale Gate (Planned)**
    - A plugin to allow artists to gate inventory on their own O&O channels.
      
---

## 5. Intellectual Property
* **🛡️ Provisional Patent Filed (USPTO)**: The core "Identity-Weighted Access Pricing" and "Hybrid Trust Architecture" are protected IP.
* **Open Source License**: The code in this repository is released under MIT License for the purpose of the hackathon and developer community review.

---

## 6. Contact & Status
* **Lead Researcher**: Jiani Zhao
* **Location**: Shanghai
* **Status**: Active Development for Consensus 2026
