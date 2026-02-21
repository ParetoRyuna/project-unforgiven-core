use std::collections::{HashSet, VecDeque};
use std::env;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use futures_util::StreamExt;
use rig::client::{CompletionClient, ProviderClient};
use rig::completion::Prompt;
use rig::providers::openai;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use solana_client::nonblocking::pubsub_client::PubsubClient;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_client::rpc_config::{RpcTransactionLogsConfig, RpcTransactionLogsFilter};
use solana_client::rpc_response::RpcLogsResponse;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, Signer};
use solana_sdk::transaction::Transaction;
use tokio::sync::{mpsc, Mutex};
use tokio::time::sleep;
use tracing::{debug, error, info, warn};
use tracing_subscriber::EnvFilter;

const PAYLOAD_V0_LEN: usize = 141;
const PREVIEW_EVENT_NAME: &str = "PreviewPriceEvent";
const SET_MODEL_HASH_IX_NAME: &str = "set_scoring_model_hash";
const LOG_PREFIX_PROGRAM_DATA: &str = "Program data: ";
const USER_MODE_VERIFIED: u8 = 2;

#[derive(Debug, Clone, Deserialize)]
struct SentinelConfig {
    solana: SolanaConfig,
    thresholds: ThresholdConfig,
    governance: GovernanceConfig,
    rig: RigConfig,
    runtime: RuntimeConfig,
}

#[derive(Debug, Clone, Deserialize)]
struct SolanaConfig {
    ws_url: String,
    rpc_url: String,
    program_id: String,
    admin_config_pubkey: String,
    commitment: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ThresholdConfig {
    window_secs: u64,
    guest_dignity_score: u8,
    verified_user_mode: Option<u8>,
    min_samples_for_growth: usize,
    dedupe_ttl_secs: u64,
    fuzzy: FuzzyConfig,
    voting: VotingWeights,
    response: ResponseThresholds,
}

#[derive(Debug, Clone, Deserialize)]
struct FuzzyConfig {
    jitter_epoch_secs: u64,
    guest_request_min: u64,
    guest_request_max: u64,
    acceleration_min: f64,
    acceleration_max: f64,
    scissor_gap_min: f64,
    scissor_gap_max: f64,
    low_entropy_min: f64,
    low_entropy_max: f64,
    verified_absence_rate_max_min: f64,
    verified_absence_rate_max_max: f64,
    edge_noise_bps: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct VotingWeights {
    dimension_a_weight: f64,
    dimension_b_weight: f64,
    dimension_c_weight: f64,
}

#[derive(Debug, Clone, Deserialize)]
struct ResponseThresholds {
    mild_probability: f64,
    severe_probability: f64,
}

#[derive(Debug, Clone, Deserialize)]
struct GovernanceConfig {
    authority_keypair_path: String,
    min_action_interval_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct RigConfig {
    enabled: bool,
    model: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RuntimeConfig {
    event_channel_capacity: usize,
    reconnect_backoff_ms: u64,
}

#[derive(Debug, Clone)]
struct PreviewEventEnvelope {
    signature: String,
    observed_at: Instant,
    observed_unix_ms: u64,
    event: PreviewPriceEventWire,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PreviewPriceEventWire {
    final_price: u64,
    is_infinite: bool,
    blocked: bool,
    effective_velocity_bps: i64,
    dignity_score: u8,
    adapter_mask: u8,
    dignity_bucket: u8,
    user_mode: u8,
}

#[derive(Debug, Clone)]
struct EventSample {
    observed_at: Instant,
    observed_unix_ms: u64,
    effective_velocity_bps: i64,
    dignity_score: u8,
    user_mode: u8,
}

#[derive(Debug, Clone)]
struct WindowMetrics {
    total_requests: usize,
    guest_requests: usize,
    verified_requests: usize,
    guest_ratio: f64,
    verified_ratio: f64,
    guest_rate_per_sec: f64,
    verified_rate_per_sec: f64,
    velocity_growth_pct: f64,
    latest_velocity_bps: i64,
    observed_span_secs: f64,
}

#[derive(Debug, Clone)]
struct FuzzyThresholdSnapshot {
    guest_request_threshold: f64,
    acceleration_threshold: f64,
    scissor_gap_threshold: f64,
    low_entropy_threshold: f64,
    verified_absence_rate_max: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
enum ResponseTier {
    Observe,
    Mild,
    Severe,
}

impl ResponseTier {
    fn as_str(self) -> &'static str {
        match self {
            ResponseTier::Observe => "observe",
            ResponseTier::Mild => "mild",
            ResponseTier::Severe => "severe",
        }
    }
}

#[derive(Debug, Clone)]
struct AttackAssessment {
    probability: f64,
    tier: ResponseTier,
    dimension_a_score: f64,
    dimension_b_score: f64,
    dimension_c_score: f64,
    acceleration_rms: f64,
    scissor_gap: f64,
    timestamp_entropy: f64,
    fuzzy: FuzzyThresholdSnapshot,
}

#[derive(Debug, Clone)]
struct AttackSignal {
    metrics: WindowMetrics,
    assessment: AttackAssessment,
    triggered_at: Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AgentDecision {
    action: String,
    confidence: f64,
    reason: String,
}

impl AgentDecision {
    fn should_trigger(&self) -> bool {
        self.action.eq_ignore_ascii_case("TRIGGER")
    }
}

#[derive(Debug, Clone, Serialize)]
struct ScoringModelPatch {
    policy_tag: &'static str,
    payload_v0_len_bytes: usize,
    response_tier: &'static str,
    reason: String,
    vrgda_k_multiplier: f64,
    guest_dignity_weight: f64,
    guest_heat_weight_multiplier: f64,
    guest_loyalty_discount_enabled: bool,
    guest_trading_blocked: bool,
    attack_probability: f64,
    dimension_a_score: f64,
    dimension_b_score: f64,
    dimension_c_score: f64,
}

#[derive(Debug, Default)]
struct SlidingWindow {
    samples: VecDeque<EventSample>,
}

impl SlidingWindow {
    fn push(&mut self, sample: EventSample, window: Duration) {
        self.samples.push_back(sample);
        self.evict_expired(window);
    }

    fn evict_expired(&mut self, window: Duration) {
        let now = Instant::now();
        while let Some(front) = self.samples.front() {
            if now.duration_since(front.observed_at) > window {
                self.samples.pop_front();
            } else {
                break;
            }
        }
    }

    fn samples(&self) -> &VecDeque<EventSample> {
        &self.samples
    }

    fn metrics(&self, guest_dignity: u8, verified_user_mode: u8) -> Option<WindowMetrics> {
        let total = self.samples.len();
        if total == 0 {
            return None;
        }

        let guest_requests = self
            .samples
            .iter()
            .filter(|s| s.dignity_score == guest_dignity)
            .count();
        let verified_requests = self
            .samples
            .iter()
            .filter(|s| s.user_mode == verified_user_mode)
            .count();

        let guest_ratio = guest_requests as f64 / total as f64;
        let verified_ratio = verified_requests as f64 / total as f64;
        let latest_velocity_bps = self
            .samples
            .back()
            .map(|s| s.effective_velocity_bps)
            .unwrap_or(0);

        let oldest_ms = self
            .samples
            .front()
            .map(|s| s.observed_unix_ms)
            .unwrap_or(0);
        let newest_ms = self.samples.back().map(|s| s.observed_unix_ms).unwrap_or(0);
        let span_ms = newest_ms.saturating_sub(oldest_ms).max(1);
        let observed_span_secs = span_ms as f64 / 1000.0;

        let velocity_growth_pct = compute_velocity_growth_pct(&self.samples);

        Some(WindowMetrics {
            total_requests: total,
            guest_requests,
            verified_requests,
            guest_ratio,
            verified_ratio,
            guest_rate_per_sec: guest_requests as f64 / observed_span_secs,
            verified_rate_per_sec: verified_requests as f64 / observed_span_secs,
            velocity_growth_pct,
            latest_velocity_bps,
            observed_span_secs,
        })
    }
}

#[derive(Debug)]
struct SignatureDedupe {
    ttl: Duration,
    ordered: VecDeque<(Instant, String)>,
    set: HashSet<String>,
}

impl SignatureDedupe {
    fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            ordered: VecDeque::new(),
            set: HashSet::new(),
        }
    }

    fn insert_if_new(&mut self, signature: &str) -> bool {
        self.evict_expired();
        if self.set.contains(signature) {
            return false;
        }
        let sig = signature.to_string();
        self.set.insert(sig.clone());
        self.ordered.push_back((Instant::now(), sig));
        true
    }

    fn evict_expired(&mut self) {
        let now = Instant::now();
        while let Some((ts, _)) = self.ordered.front() {
            if now.duration_since(*ts) > self.ttl {
                let (_, old_sig) = self.ordered.pop_front().expect("front exists");
                self.set.remove(&old_sig);
                continue;
            }
            break;
        }
    }
}

struct RigGovernanceAgent {
    enabled: bool,
    model: String,
    client: Option<openai::Client>,
}

impl RigGovernanceAgent {
    fn new(cfg: &RigConfig) -> Self {
        let client = if cfg.enabled {
            Some(openai::Client::from_env())
        } else {
            None
        };
        Self {
            enabled: cfg.enabled,
            model: cfg.model.clone(),
            client,
        }
    }

    async fn decide(
        &self,
        signal: &AttackSignal,
        thresholds: &ThresholdConfig,
    ) -> Result<AgentDecision> {
        if !self.enabled {
            return Ok(AgentDecision {
                action: "TRIGGER".to_string(),
                confidence: 1.0,
                reason: "rig disabled; deterministic judge triggered".to_string(),
            });
        }

        let client = match &self.client {
            Some(c) => c,
            None => {
                // Keep default path (rig.disabled) free of OPENAI_API_KEY requirements.
                return Err(anyhow!("rig enabled but OpenAI client not initialized (missing OPENAI_API_KEY?)"));
            }
        };

        let agent = client
            .agent(self.model.as_str())
            .preamble(
                "You are Wan Wan Sentinel governance copilot. \
                 Return STRICT JSON only with keys: action, confidence, reason. \
                 action must be TRIGGER or BYPASS. \
                 If tier is severe and dimensions agree, choose TRIGGER.",
            )
            .build();

        let prompt = format!(
            "window_secs={}\n\
             guest_dignity={}\n\
             tier={}\n\
             probability={:.4}\n\
             dim_a={:.4}\n\
             dim_b={:.4}\n\
             dim_c={:.4}\n\
             acceleration_rms={:.4}\n\
             scissor_gap={:.4}\n\
             timestamp_entropy={:.4}\n\
             guest_requests={}\n\
             verified_requests={}\n\
             guest_rate_per_sec={:.4}\n\
             verified_rate_per_sec={:.4}\n\
             fuzzy_guest_threshold={:.2}\n\
             fuzzy_accel_threshold={:.4}\n\
             fuzzy_gap_threshold={:.4}\n\
             fuzzy_entropy_threshold={:.4}\n\
             output JSON only.",
            thresholds.window_secs,
            thresholds.guest_dignity_score,
            signal.assessment.tier.as_str(),
            signal.assessment.probability,
            signal.assessment.dimension_a_score,
            signal.assessment.dimension_b_score,
            signal.assessment.dimension_c_score,
            signal.assessment.acceleration_rms,
            signal.assessment.scissor_gap,
            signal.assessment.timestamp_entropy,
            signal.metrics.guest_requests,
            signal.metrics.verified_requests,
            signal.metrics.guest_rate_per_sec,
            signal.metrics.verified_rate_per_sec,
            signal.assessment.fuzzy.guest_request_threshold,
            signal.assessment.fuzzy.acceleration_threshold,
            signal.assessment.fuzzy.scissor_gap_threshold,
            signal.assessment.fuzzy.low_entropy_threshold,
        );

        let raw = agent
            .prompt(prompt.as_str())
            .await
            .context("rig agent prompt failed")?;
        parse_agent_decision(&raw)
    }
}

#[derive(Debug, Default)]
struct GovernanceState {
    last_success_action_at: Option<Instant>,
    action_in_flight: bool,
}

struct GovernanceExecutor {
    rpc: Arc<RpcClient>,
    program_id: Pubkey,
    admin_config_pubkey: Pubkey,
    authority: Arc<solana_sdk::signature::Keypair>,
    min_action_interval: Duration,
    state: Arc<Mutex<GovernanceState>>,
}

impl GovernanceExecutor {
    fn parse_admin_active_hash(data: &[u8]) -> Option<[u8; 32]> {
        // Anchor layout: 8 disc + authority(32) + oracle_pubkey(32) + active_hash(32) + bump(1)
        if data.len() < 105 {
            return None;
        }
        let mut out = [0u8; 32];
        out.copy_from_slice(&data[72..104]);
        Some(out)
    }

    fn hex32(v: [u8; 32]) -> String {
        let mut s = String::with_capacity(64);
        for b in v {
            s.push_str(&format!("{:02x}", b));
        }
        s
    }

    fn new(cfg: &SentinelConfig) -> Result<Self> {
        let commitment = parse_commitment(cfg.solana.commitment.as_deref());
        let rpc = Arc::new(RpcClient::new_with_commitment(
            cfg.solana.rpc_url.clone(),
            commitment,
        ));
        let program_id: Pubkey = cfg
            .solana
            .program_id
            .parse()
            .context("invalid solana.program_id")?;
        let admin_config_pubkey: Pubkey = cfg
            .solana
            .admin_config_pubkey
            .parse()
            .context("invalid solana.admin_config_pubkey")?;
        let (expected_admin_pda, _) =
            Pubkey::find_program_address(&[b"admin_config_v2"], &program_id);
        if admin_config_pubkey != expected_admin_pda {
            return Err(anyhow!(
                "solana.admin_config_pubkey mismatch: expected {}, got {}",
                expected_admin_pda,
                admin_config_pubkey
            ));
        }
        let authority = Arc::new(
            read_keypair_file(&cfg.governance.authority_keypair_path).map_err(|err| {
                anyhow!(
                    "failed to read keypair at {}: {}",
                    cfg.governance.authority_keypair_path,
                    err
                )
            })?,
        );

        Ok(Self {
            rpc,
            program_id,
            admin_config_pubkey,
            authority,
            min_action_interval: Duration::from_secs(cfg.governance.min_action_interval_secs),
            state: Arc::new(Mutex::new(GovernanceState::default())),
        })
    }

    async fn trigger_if_needed(
        self: Arc<Self>,
        signal: AttackSignal,
        decision: AgentDecision,
    ) -> Result<()> {
        if signal.assessment.tier == ResponseTier::Observe {
            return Ok(());
        }

        let mut state = self.state.lock().await;
        if state.action_in_flight {
            debug!("governance action skipped: another action in flight");
            return Ok(());
        }
        if let Some(last) = state.last_success_action_at {
            if last.elapsed() < self.min_action_interval {
                debug!("governance action skipped: cooldown");
                return Ok(());
            }
        }
        state.action_in_flight = true;
        drop(state);

        let force_severe = signal.assessment.tier == ResponseTier::Severe;
        let should_trigger = decision.should_trigger() || force_severe;

        let result = if should_trigger {
            if force_severe && !decision.should_trigger() {
                warn!(
                    confidence = decision.confidence,
                    reason = %decision.reason,
                    "override BYPASS because tier=severe"
                );
            }
            self.execute_action(signal, &decision.reason).await
        } else {
            info!(
                confidence = decision.confidence,
                reason = %decision.reason,
                "rig decided to bypass mild response"
            );
            Ok(())
        };

        let mut state = self.state.lock().await;
        state.action_in_flight = false;
        if result.is_ok() {
            state.last_success_action_at = Some(Instant::now());
        }
        drop(state);
        result
    }

    async fn execute_action(&self, signal: AttackSignal, reason: &str) -> Result<()> {
        let patch = build_scoring_patch(&signal, reason.to_string());
        let model_hash = compute_model_hash(&patch)?;

        let before_hash = match self.rpc.get_account_data(&self.admin_config_pubkey).await {
            Ok(data) => Self::parse_admin_active_hash(&data),
            Err(_) => None,
        };

        let ix = build_set_scoring_model_hash_ix(
            self.program_id,
            self.admin_config_pubkey,
            self.authority.pubkey(),
            model_hash,
        );

        let latest_blockhash = self
            .rpc
            .get_latest_blockhash()
            .await
            .context("failed to fetch latest blockhash")?;
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.authority.pubkey()),
            &[self.authority.as_ref()],
            latest_blockhash,
        );

        let sig = self
            .rpc
            .send_and_confirm_transaction(&tx)
            .await
            .context("set_scoring_model_hash tx failed")?;

        let after_hash = match self.rpc.get_account_data(&self.admin_config_pubkey).await {
            Ok(data) => Self::parse_admin_active_hash(&data),
            Err(_) => None,
        };

        info!(
            tx_signature = %sig,
            tier = %signal.assessment.tier.as_str(),
            probability = signal.assessment.probability,
            dim_a = signal.assessment.dimension_a_score,
            dim_b = signal.assessment.dimension_b_score,
            dim_c = signal.assessment.dimension_c_score,
            decision_latency_ms = signal.triggered_at.elapsed().as_millis() as u64,
            reason = reason,
            "governance action submitted"
        );

        if let (Some(b), Some(a)) = (before_hash, after_hash) {
            info!(
                admin_config = %self.admin_config_pubkey,
                active_scoring_model_hash_before = %Self::hex32(b),
                active_scoring_model_hash_after = %Self::hex32(a),
                "admin_config active_scoring_model_hash verified"
            );
        }
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_level(true)
        .init();

    ensure_payload_spec()?;

    let config_path = env::args()
        .nth(1)
        .unwrap_or_else(default_config_path);
    let cfg = Arc::new(load_config(&config_path)?);
    let program_id: Pubkey = cfg
        .solana
        .program_id
        .parse()
        .context("invalid solana.program_id")?;
    let (derived_admin_pda, _) = Pubkey::find_program_address(&[b"admin_config_v2"], &program_id);

    info!("Wan Wan Sentinel v2 started");
    info!("payload spec aligned: PAYLOAD_V0 len={}", PAYLOAD_V0_LEN);
    info!(
        program_id = %program_id,
        configured_admin_pda = %cfg.solana.admin_config_pubkey,
        derived_admin_pda = %derived_admin_pda,
        "sentinel governance config loaded"
    );

    let (tx, rx) = mpsc::channel(cfg.runtime.event_channel_capacity);

    let producer_cfg = Arc::clone(&cfg);
    tokio::spawn(async move {
        if let Err(err) = subscribe_preview_events(producer_cfg, tx).await {
            error!(error = %err, "subscription loop terminated");
        }
    });

    let governance = Arc::new(GovernanceExecutor::new(&cfg)?);
    let agent = Arc::new(RigGovernanceAgent::new(&cfg.rig));

    detection_loop(cfg, rx, governance, agent).await
}

async fn detection_loop(
    cfg: Arc<SentinelConfig>,
    mut rx: mpsc::Receiver<PreviewEventEnvelope>,
    governance: Arc<GovernanceExecutor>,
    agent: Arc<RigGovernanceAgent>,
) -> Result<()> {
    let mut dedupe = SignatureDedupe::new(Duration::from_secs(cfg.thresholds.dedupe_ttl_secs));
    let mut window = SlidingWindow::default();
    let window_len = Duration::from_secs(cfg.thresholds.window_secs);
    let verified_mode = cfg
        .thresholds
        .verified_user_mode
        .unwrap_or(USER_MODE_VERIFIED);

    while let Some(envelope) = rx.recv().await {
        if !dedupe.insert_if_new(&envelope.signature) {
            continue;
        }

        window.push(
            EventSample {
                observed_at: envelope.observed_at,
                observed_unix_ms: envelope.observed_unix_ms,
                effective_velocity_bps: envelope.event.effective_velocity_bps,
                dignity_score: envelope.event.dignity_score,
                user_mode: envelope.event.user_mode,
            },
            window_len,
        );

        let Some(metrics) = window.metrics(cfg.thresholds.guest_dignity_score, verified_mode)
        else {
            continue;
        };
        if metrics.total_requests < cfg.thresholds.min_samples_for_growth {
            continue;
        }

        let assessment =
            judge_attack_probability(window.samples(), &metrics, &cfg.thresholds, now_unix_secs());

        if assessment.tier == ResponseTier::Observe {
            continue;
        }

        let signal = AttackSignal {
            metrics: metrics.clone(),
            assessment: assessment.clone(),
            triggered_at: Instant::now(),
        };

        warn!(
            tier = %assessment.tier.as_str(),
            probability = assessment.probability,
            dim_a = assessment.dimension_a_score,
            dim_b = assessment.dimension_b_score,
            dim_c = assessment.dimension_c_score,
            blocked = envelope.event.blocked,
            price_lamports = envelope.event.final_price,
            guest_requests = metrics.guest_requests,
            verified_requests = metrics.verified_requests,
            guest_ratio = metrics.guest_ratio,
            verified_ratio = metrics.verified_ratio,
            velocity_growth_pct = metrics.velocity_growth_pct,
            latest_velocity_bps = metrics.latest_velocity_bps,
            observed_span_secs = metrics.observed_span_secs,
            "attack assessment triggered"
        );

        let decision = match agent.decide(&signal, &cfg.thresholds).await {
            Ok(d) => d,
            Err(err) => {
                warn!(error = %err, "rig decision failed, fallback to deterministic trigger");
                AgentDecision {
                    action: "TRIGGER".to_string(),
                    confidence: 1.0,
                    reason: "rig failure fallback".to_string(),
                }
            }
        };

        if let Err(err) = Arc::clone(&governance)
            .trigger_if_needed(signal, decision)
            .await
        {
            error!(error = %err, "governance action failed");
        }
    }

    Ok(())
}

fn judge_attack_probability(
    window: &VecDeque<EventSample>,
    metrics: &WindowMetrics,
    thresholds: &ThresholdConfig,
    now_unix_secs: u64,
) -> AttackAssessment {
    let fuzz = materialize_fuzzy_thresholds(&thresholds.fuzzy, now_unix_secs);

    // Dimension A: second derivative (acceleration anomaly) of effective_velocity_bps.
    let acceleration_rms = compute_velocity_second_derivative_rms(window);
    let guest_pressure =
        membership_high(metrics.guest_requests as f64, fuzz.guest_request_threshold);
    let mut dimension_a = membership_high(acceleration_rms, fuzz.acceleration_threshold);
    dimension_a = (0.75 * dimension_a + 0.25 * guest_pressure).clamp(0.0, 1.0);

    // Dimension B: guest/verified scissor gap, with verified disappearance boost.
    let scissor_gap = metrics.guest_rate_per_sec - metrics.verified_rate_per_sec;
    let mut dimension_b = membership_high(scissor_gap, fuzz.scissor_gap_threshold);
    let verified_disappeared = metrics.verified_rate_per_sec <= fuzz.verified_absence_rate_max;
    let guest_spike = metrics.guest_requests as f64 >= fuzz.guest_request_threshold;
    if verified_disappeared && guest_spike {
        dimension_b = dimension_b.max(0.94);
    }

    // Dimension C: low entropy implies machine-like regular timing.
    let timestamp_entropy = compute_timestamp_entropy(window);
    let mut dimension_c = membership_low(timestamp_entropy, fuzz.low_entropy_threshold);
    if timestamp_entropy < fuzz.low_entropy_threshold * 0.6 {
        dimension_c = (dimension_c + 0.1).min(1.0);
    }

    let weights = &thresholds.voting;
    let weight_sum =
        (weights.dimension_a_weight + weights.dimension_b_weight + weights.dimension_c_weight)
            .max(1e-9);

    let mut probability = (dimension_a * weights.dimension_a_weight
        + dimension_b * weights.dimension_b_weight
        + dimension_c * weights.dimension_c_weight)
        / weight_sum;

    if verified_disappeared && guest_spike && dimension_a > 0.7 {
        probability = (probability + 0.08).min(1.0);
    }

    // Game-theoretic anti-probing: deterministic jitter around boundaries.
    let edge_noise = fuzzy_unit_noise(
        now_unix_secs,
        thresholds.fuzzy.jitter_epoch_secs,
        "edge_noise",
    ) * (thresholds.fuzzy.edge_noise_bps as f64 / 10_000.0);
    probability = (probability + edge_noise).clamp(0.0, 1.0);

    let mut tier = if probability >= thresholds.response.severe_probability {
        ResponseTier::Severe
    } else if probability >= thresholds.response.mild_probability {
        ResponseTier::Mild
    } else {
        ResponseTier::Observe
    };

    if verified_disappeared && guest_spike && dimension_b > 0.9 && dimension_c > 0.8 {
        tier = ResponseTier::Severe;
        probability = probability.max(thresholds.response.severe_probability);
    }

    AttackAssessment {
        probability,
        tier,
        dimension_a_score: dimension_a,
        dimension_b_score: dimension_b,
        dimension_c_score: dimension_c,
        acceleration_rms,
        scissor_gap,
        timestamp_entropy,
        fuzzy: fuzz,
    }
}

fn materialize_fuzzy_thresholds(fuzzy: &FuzzyConfig, now_unix_secs: u64) -> FuzzyThresholdSnapshot {
    FuzzyThresholdSnapshot {
        guest_request_threshold: fuzzy_in_range(
            fuzzy.guest_request_min as f64,
            fuzzy.guest_request_max as f64,
            now_unix_secs,
            fuzzy.jitter_epoch_secs,
            "guest_request",
        ),
        acceleration_threshold: fuzzy_in_range(
            fuzzy.acceleration_min,
            fuzzy.acceleration_max,
            now_unix_secs,
            fuzzy.jitter_epoch_secs,
            "acceleration",
        ),
        scissor_gap_threshold: fuzzy_in_range(
            fuzzy.scissor_gap_min,
            fuzzy.scissor_gap_max,
            now_unix_secs,
            fuzzy.jitter_epoch_secs,
            "scissor_gap",
        ),
        low_entropy_threshold: fuzzy_in_range(
            fuzzy.low_entropy_min,
            fuzzy.low_entropy_max,
            now_unix_secs,
            fuzzy.jitter_epoch_secs,
            "low_entropy",
        ),
        verified_absence_rate_max: fuzzy_in_range(
            fuzzy.verified_absence_rate_max_min,
            fuzzy.verified_absence_rate_max_max,
            now_unix_secs,
            fuzzy.jitter_epoch_secs,
            "verified_absence_rate",
        ),
    }
}

fn fuzzy_in_range(
    min: f64,
    max: f64,
    now_unix_secs: u64,
    jitter_epoch_secs: u64,
    label: &str,
) -> f64 {
    if (max - min).abs() < f64::EPSILON {
        return min;
    }
    let epoch = now_unix_secs / jitter_epoch_secs.max(1);
    let r = hash_to_unit(epoch, label);
    min + (max - min) * r
}

fn fuzzy_unit_noise(now_unix_secs: u64, jitter_epoch_secs: u64, label: &str) -> f64 {
    let epoch = now_unix_secs / jitter_epoch_secs.max(1);
    hash_to_unit(epoch, label) * 2.0 - 1.0
}

fn hash_to_unit(epoch: u64, label: &str) -> f64 {
    let mut hasher = Sha256::new();
    hasher.update(b"wanwan-sentinel-v2");
    hasher.update(label.as_bytes());
    hasher.update(epoch.to_le_bytes());
    let digest = hasher.finalize();
    let mut arr = [0u8; 8];
    arr.copy_from_slice(&digest[0..8]);
    let v = u64::from_le_bytes(arr);
    (v as f64) / (u64::MAX as f64)
}

fn membership_high(value: f64, threshold: f64) -> f64 {
    let width = threshold.abs().max(1.0) * 0.35;
    let z = (value - threshold) / width;
    sigmoid(z)
}

fn membership_low(value: f64, threshold: f64) -> f64 {
    let width = threshold.abs().max(0.05) * 0.35;
    let z = (threshold - value) / width;
    sigmoid(z)
}

fn sigmoid(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}

fn compute_velocity_second_derivative_rms(samples: &VecDeque<EventSample>) -> f64 {
    if samples.len() < 3 {
        return 0.0;
    }

    let mut sum_sq = 0.0;
    let mut n = 0usize;

    for i in 2..samples.len() {
        let s0 = &samples[i - 2];
        let s1 = &samples[i - 1];
        let s2 = &samples[i];

        let t0 = s0.observed_unix_ms as f64 / 1000.0;
        let t1 = s1.observed_unix_ms as f64 / 1000.0;
        let t2 = s2.observed_unix_ms as f64 / 1000.0;

        let dt1 = (t1 - t0).max(1e-3);
        let dt2 = (t2 - t1).max(1e-3);

        let v0 = s0.effective_velocity_bps as f64;
        let v1 = s1.effective_velocity_bps as f64;
        let v2 = s2.effective_velocity_bps as f64;

        let slope1 = (v1 - v0) / dt1;
        let slope2 = (v2 - v1) / dt2;
        let second = (slope2 - slope1) / ((dt1 + dt2) * 0.5).max(1e-3);

        sum_sq += second * second;
        n += 1;
    }

    if n == 0 {
        0.0
    } else {
        (sum_sq / n as f64).sqrt()
    }
}

fn compute_timestamp_entropy(samples: &VecDeque<EventSample>) -> f64 {
    if samples.len() < 3 {
        return 1.0;
    }

    let bins = 12usize;
    let mut counts = vec![0usize; bins];
    let mut total = 0usize;

    for i in 1..samples.len() {
        let prev = samples[i - 1].observed_unix_ms;
        let curr = samples[i].observed_unix_ms;
        let dt_ms = curr.saturating_sub(prev).max(1) as usize;
        let bucket = (dt_ms / 100).min(bins - 1);
        counts[bucket] += 1;
        total += 1;
    }

    if total == 0 {
        return 1.0;
    }

    let mut entropy = 0.0;
    for c in counts {
        if c == 0 {
            continue;
        }
        let p = c as f64 / total as f64;
        entropy -= p * p.ln();
    }

    let max_entropy = (bins as f64).ln().max(1e-9);
    (entropy / max_entropy).clamp(0.0, 1.0)
}

fn build_scoring_patch(signal: &AttackSignal, reason: String) -> ScoringModelPatch {
    let (
        vrgda_k_multiplier,
        guest_dignity_weight,
        guest_heat_weight_multiplier,
        guest_loyalty_discount_enabled,
        guest_trading_blocked,
    ) = match signal.assessment.tier {
        ResponseTier::Observe => (1.0, 1.0, 1.0, true, false),
        // Mild anomaly: gently lift VRGDA slope k.
        ResponseTier::Mild => (1.08, 1.0, 1.4, false, false),
        // Severe attack: zero guest dignity weight and block guest trades.
        ResponseTier::Severe => (1.35, 0.0, 4.0, false, true),
    };

    ScoringModelPatch {
        policy_tag: "wanwan.sentinel.hotfix.v2",
        payload_v0_len_bytes: PAYLOAD_V0_LEN,
        response_tier: signal.assessment.tier.as_str(),
        reason,
        vrgda_k_multiplier,
        guest_dignity_weight,
        guest_heat_weight_multiplier,
        guest_loyalty_discount_enabled,
        guest_trading_blocked,
        attack_probability: signal.assessment.probability,
        dimension_a_score: signal.assessment.dimension_a_score,
        dimension_b_score: signal.assessment.dimension_b_score,
        dimension_c_score: signal.assessment.dimension_c_score,
    }
}

async fn subscribe_preview_events(
    cfg: Arc<SentinelConfig>,
    tx: mpsc::Sender<PreviewEventEnvelope>,
) -> Result<()> {
    let filter = RpcTransactionLogsFilter::Mentions(vec![cfg.solana.program_id.clone()]);
    let logs_config = RpcTransactionLogsConfig {
        commitment: Some(parse_commitment(cfg.solana.commitment.as_deref())),
    };

    loop {
        let client = match PubsubClient::new(&cfg.solana.ws_url).await {
            Ok(c) => c,
            Err(err) => {
                warn!(error = %err, "pubsub connect failed; reconnecting");
                sleep(Duration::from_millis(cfg.runtime.reconnect_backoff_ms)).await;
                continue;
            }
        };

        info!("connected to Solana pubsub");
        let (mut stream, unsubscribe) = match client.logs_subscribe(filter.clone(), logs_config.clone()).await {
            Ok(v) => v,
            Err(err) => {
                warn!(error = %err, "logs_subscribe failed; reconnecting");
                sleep(Duration::from_millis(cfg.runtime.reconnect_backoff_ms)).await;
                continue;
            }
        };

        while let Some(response) = stream.next().await {
            let logs: &RpcLogsResponse = &response.value;
            if logs.err.is_some() {
                continue;
            }
            let Some(event) = decode_preview_event(logs) else {
                continue;
            };
            debug!(
                tx_signature = %logs.signature,
                price_lamports = event.final_price,
                blocked = event.blocked,
                dignity_score = event.dignity_score,
                user_mode = event.user_mode,
                effective_velocity_bps = event.effective_velocity_bps,
                "preview event received"
            );
            let envelope = PreviewEventEnvelope {
                signature: logs.signature.clone(),
                observed_at: Instant::now(),
                observed_unix_ms: now_unix_millis(),
                event,
            };
            if tx.send(envelope).await.is_err() {
                warn!("consumer loop ended; stopping subscription");
                unsubscribe().await;
                return Ok(());
            }
        }

        warn!("pubsub stream closed; reconnecting");
        unsubscribe().await;
        sleep(Duration::from_millis(cfg.runtime.reconnect_backoff_ms)).await;
    }
}

fn decode_preview_event(logs: &RpcLogsResponse) -> Option<PreviewPriceEventWire> {
    let discriminator = anchor_discriminator("event", PREVIEW_EVENT_NAME);
    for line in &logs.logs {
        let encoded = match line.strip_prefix(LOG_PREFIX_PROGRAM_DATA) {
            Some(v) => v,
            None => continue,
        };

        let raw = match BASE64_STANDARD.decode(encoded) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if raw.len() < 8 || raw[..8] != discriminator {
            continue;
        }
        if let Some(event) = decode_preview_event_body(&raw[8..]) {
            return Some(event);
        }
    }
    None
}

fn decode_preview_event_body(bytes: &[u8]) -> Option<PreviewPriceEventWire> {
    if bytes.len() < 22 {
        return None;
    }
    let final_price = u64::from_le_bytes(bytes[0..8].try_into().ok()?);
    let is_infinite = bytes[8] != 0;
    let blocked = bytes[9] != 0;
    let effective_velocity_bps = i64::from_le_bytes(bytes[10..18].try_into().ok()?);
    let dignity_score = bytes[18];
    let adapter_mask = bytes[19];
    let dignity_bucket = bytes[20];
    let user_mode = bytes[21];

    Some(PreviewPriceEventWire {
        final_price,
        is_infinite,
        blocked,
        effective_velocity_bps,
        dignity_score,
        adapter_mask,
        dignity_bucket,
        user_mode,
    })
}

fn compute_velocity_growth_pct(samples: &VecDeque<EventSample>) -> f64 {
    if samples.len() < 2 {
        return 0.0;
    }

    let oldest = samples
        .front()
        .map(|s| s.observed_unix_ms)
        .unwrap_or_default() as f64
        / 1000.0;
    let newest = samples
        .back()
        .map(|s| s.observed_unix_ms)
        .unwrap_or_default() as f64
        / 1000.0;

    let split = oldest + ((newest - oldest).max(0.0) * 0.5);

    let mut prev_sum = 0f64;
    let mut prev_n = 0usize;
    let mut curr_sum = 0f64;
    let mut curr_n = 0usize;

    for sample in samples {
        let t = sample.observed_unix_ms as f64 / 1000.0;
        if t < split {
            prev_sum += sample.effective_velocity_bps as f64;
            prev_n += 1;
        } else {
            curr_sum += sample.effective_velocity_bps as f64;
            curr_n += 1;
        }
    }

    let (baseline, current) = if prev_n > 0 && curr_n > 0 {
        (prev_sum / prev_n as f64, curr_sum / curr_n as f64)
    } else {
        let first = samples
            .front()
            .map(|s| s.effective_velocity_bps as f64)
            .unwrap_or(0.0);
        let last = samples
            .back()
            .map(|s| s.effective_velocity_bps as f64)
            .unwrap_or(0.0);
        (first, last)
    };

    let denom = baseline.abs().max(1.0);
    ((current - baseline) / denom) * 100.0
}

fn compute_model_hash(patch: &ScoringModelPatch) -> Result<[u8; 32]> {
    let bytes = serde_json::to_vec(patch).context("serialize scoring model patch failed")?;
    let hash = blake3::hash(&bytes);
    Ok(*hash.as_bytes())
}

fn build_set_scoring_model_hash_ix(
    program_id: Pubkey,
    admin_config_pubkey: Pubkey,
    authority_pubkey: Pubkey,
    model_hash: [u8; 32],
) -> Instruction {
    let mut data = Vec::with_capacity(8 + 32);
    data.extend_from_slice(&anchor_discriminator("global", SET_MODEL_HASH_IX_NAME));
    data.extend_from_slice(&model_hash);

    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(authority_pubkey, true),
            AccountMeta::new(admin_config_pubkey, false),
        ],
        data,
    }
}

fn anchor_discriminator(namespace: &str, name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("{namespace}:{name}"));
    let hash = hasher.finalize();
    let mut out = [0u8; 8];
    out.copy_from_slice(&hash[..8]);
    out
}

fn parse_agent_decision(raw: &str) -> Result<AgentDecision> {
    if let Ok(v) = serde_json::from_str::<AgentDecision>(raw) {
        return Ok(v);
    }

    let Some((start, end)) = extract_json_range(raw) else {
        return Err(anyhow!("rig response is not valid JSON: {raw}"));
    };
    let body = &raw[start..=end];
    serde_json::from_str::<AgentDecision>(body).context("failed to parse embedded JSON decision")
}

fn extract_json_range(s: &str) -> Option<(usize, usize)> {
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end <= start {
        return None;
    }
    Some((start, end))
}

fn parse_commitment(v: Option<&str>) -> CommitmentConfig {
    match v.unwrap_or("confirmed").to_ascii_lowercase().as_str() {
        "processed" => CommitmentConfig::processed(),
        "finalized" => CommitmentConfig::finalized(),
        _ => CommitmentConfig::confirmed(),
    }
}

fn now_unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn ensure_payload_spec() -> Result<()> {
    if PAYLOAD_V0_LEN != 141 {
        return Err(anyhow!(
            "PAYLOAD_V0 spec mismatch: expected 141, got {}",
            PAYLOAD_V0_LEN
        ));
    }
    Ok(())
}

fn load_config(path: impl AsRef<Path>) -> Result<SentinelConfig> {
    let path_ref = path.as_ref();
    let raw = fs::read_to_string(path_ref)
        .with_context(|| format!("failed to read config file {}", path_ref.display()))?;
    toml::from_str(&raw).with_context(|| format!("invalid config TOML in {}", path_ref.display()))
}

fn default_config_path() -> String {
    let in_configs = "configs/sentinel_config_v2.toml";
    if Path::new(in_configs).exists() {
        return in_configs.to_string();
    }
    "sentinel_config_v2.toml".to_string()
}
