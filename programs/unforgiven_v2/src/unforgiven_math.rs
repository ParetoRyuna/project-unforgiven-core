const BPS_SCALE: i64 = 10_000;
const FIXED_POINT_SCALE: u128 = 1_000_000_000;
const LOYALTY_BASE_BPS: u128 = 10_000;
const LOYALTY_THRESHOLD: u8 = 70;
const LOYALTY_POINT_DISCOUNT_BPS: u128 = 30;
const BLOCK_MULTIPLIER: u128 = 100;
const BOT_PRICE_CAP_MULTIPLIER: u128 = 120;
pub const MAX_TIME_ELAPSED_SECS: u64 = 30 * 24 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VrgdaInput {
    pub initial_price: u64,
    pub sales_velocity_bps: i64,
    pub time_elapsed: u64,
    pub dignity_score: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VrgdaQuote {
    pub final_price: u64,
    pub is_infinite: bool,
    pub blocked: bool,
    pub effective_velocity_bps: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VrgdaMathError {
    InvalidSalesVelocity,
    InvalidDignityScore,
    InvalidTimeElapsed,
}

pub fn calculate_vrgda_quote(input: VrgdaInput) -> Result<VrgdaQuote, VrgdaMathError> {
    if input.dignity_score > 100 {
        return Err(VrgdaMathError::InvalidDignityScore);
    }
    if input.sales_velocity_bps <= -BPS_SCALE {
        return Err(VrgdaMathError::InvalidSalesVelocity);
    }
    if input.time_elapsed > MAX_TIME_ELAPSED_SECS {
        return Err(VrgdaMathError::InvalidTimeElapsed);
    }

    let base_price = input.initial_price.max(1);
    let score_distance = i64::from(100u8.saturating_sub(input.dignity_score));
    let heat_weight_bps = score_distance * score_distance;

    let effective_velocity_bps = match (input.sales_velocity_bps as i128)
        .checked_mul(heat_weight_bps as i128)
        .and_then(|v| v.checked_div(BPS_SCALE as i128))
    {
        Some(v) => match i64::try_from(v) {
            Ok(velocity) => velocity,
            Err(_) => return Ok(infinity_quote(input.sales_velocity_bps)),
        },
        None => return Ok(infinity_quote(input.sales_velocity_bps)),
    };

    let exp_price = match compute_exponential_price(base_price, effective_velocity_bps, input.time_elapsed) {
        Some(price) => price,
        None => return Ok(infinity_quote(effective_velocity_bps)),
    };

    let loyalty_discount_bps = LOYALTY_BASE_BPS
        .checked_sub(
            u128::from(input.dignity_score.saturating_sub(LOYALTY_THRESHOLD))
                .checked_mul(LOYALTY_POINT_DISCOUNT_BPS)
                .unwrap_or(LOYALTY_BASE_BPS),
        )
        .unwrap_or(0);

    let final_price_u128 = match exp_price
        .checked_mul(loyalty_discount_bps)
        .and_then(|v| v.checked_div(LOYALTY_BASE_BPS))
    {
        Some(value) => value.max(1),
        None => return Ok(infinity_quote(effective_velocity_bps)),
    };

    let capped_price_u128 = final_price_u128.min(u128::from(base_price).saturating_mul(BOT_PRICE_CAP_MULTIPLIER));

    let final_price = match u64::try_from(capped_price_u128) {
        Ok(price) => price.max(1),
        Err(_) => return Ok(infinity_quote(effective_velocity_bps)),
    };

    let blocked_threshold = u128::from(base_price).saturating_mul(BLOCK_MULTIPLIER);
    let blocked = u128::from(final_price) >= blocked_threshold;

    Ok(VrgdaQuote {
        final_price,
        is_infinite: false,
        blocked,
        effective_velocity_bps,
    })
}

fn infinity_quote(effective_velocity_bps: i64) -> VrgdaQuote {
    VrgdaQuote {
        final_price: u64::MAX,
        is_infinite: true,
        blocked: true,
        effective_velocity_bps,
    }
}

fn compute_exponential_price(base_price: u64, velocity_bps: i64, time_elapsed: u64) -> Option<u128> {
    if time_elapsed == 0 || velocity_bps == 0 {
        return Some(u128::from(base_price.max(1)));
    }

    let growth_numerator = (BPS_SCALE as i128).checked_add(velocity_bps as i128)?;
    if growth_numerator <= 0 {
        return Some(1);
    }

    let per_step_growth_fp = (growth_numerator as u128)
        .checked_mul(FIXED_POINT_SCALE)?
        .checked_div(BPS_SCALE as u128)?;

    let growth_factor_fp = pow_fixed(per_step_growth_fp, time_elapsed)?;

    let price_u128 = u128::from(base_price.max(1))
        .checked_mul(growth_factor_fp)?
        .checked_div(FIXED_POINT_SCALE)?;

    Some(price_u128.max(1))
}

fn pow_fixed(mut base_fp: u128, mut exponent: u64) -> Option<u128> {
    let mut result_fp = FIXED_POINT_SCALE;

    while exponent > 0 {
        if (exponent & 1) == 1 {
            result_fp = result_fp.checked_mul(base_fp)?.checked_div(FIXED_POINT_SCALE)?;
        }

        exponent >>= 1;
        if exponent > 0 {
            base_fp = base_fp.checked_mul(base_fp)?.checked_div(FIXED_POINT_SCALE)?;
        }
    }

    Some(result_fp)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE_SOL_LAMPORTS: u64 = 1_000_000_000;

    #[test]
    fn dignity_score_reduces_price_monotonically_under_same_heat() {
        let hot = VrgdaInput {
            initial_price: ONE_SOL_LAMPORTS,
            sales_velocity_bps: 5_000,
            time_elapsed: 12,
            dignity_score: 0,
        };
        let medium = VrgdaInput {
            dignity_score: 50,
            ..hot
        };
        let high = VrgdaInput {
            dignity_score: 90,
            ..hot
        };

        let q_hot = calculate_vrgda_quote(hot).unwrap();
        let q_medium = calculate_vrgda_quote(medium).unwrap();
        let q_high = calculate_vrgda_quote(high).unwrap();

        assert!(q_hot.final_price > q_medium.final_price);
        assert!(q_medium.final_price > q_high.final_price);
    }

    #[test]
    fn extreme_heat_returns_infinity_without_panicking() {
        let quote = calculate_vrgda_quote(VrgdaInput {
            initial_price: u64::MAX,
            sales_velocity_bps: 9_000,
            time_elapsed: 1_000,
            dignity_score: 0,
        })
        .unwrap();

        assert!(quote.is_infinite);
        assert!(quote.blocked);
        assert_eq!(quote.final_price, u64::MAX);
    }

    #[test]
    fn red_team_showcase_vector_splits_bot_and_human_prices() {
        let bot = calculate_vrgda_quote(VrgdaInput {
            initial_price: ONE_SOL_LAMPORTS,
            sales_velocity_bps: 5_000,
            time_elapsed: 12,
            dignity_score: 0,
        })
        .unwrap();
        let human = calculate_vrgda_quote(VrgdaInput {
            initial_price: ONE_SOL_LAMPORTS,
            sales_velocity_bps: 5_000,
            time_elapsed: 12,
            dignity_score: 90,
        })
        .unwrap();

        assert!(bot.final_price >= 100 * ONE_SOL_LAMPORTS);
        assert!(bot.final_price <= 120 * ONE_SOL_LAMPORTS);
        assert!(human.final_price >= 800_000_000);
        assert!(human.final_price <= 1_200_000_000);
    }

    #[test]
    fn rust_fixture_vectors_for_sdk_alignment() {
        let v0 = calculate_vrgda_quote(VrgdaInput {
            initial_price: ONE_SOL_LAMPORTS,
            sales_velocity_bps: 5_000,
            time_elapsed: 12,
            dignity_score: 0,
        })
        .unwrap();
        let v50 = calculate_vrgda_quote(VrgdaInput {
            initial_price: ONE_SOL_LAMPORTS,
            sales_velocity_bps: 5_000,
            time_elapsed: 12,
            dignity_score: 50,
        })
        .unwrap();
        let v90 = calculate_vrgda_quote(VrgdaInput {
            initial_price: ONE_SOL_LAMPORTS,
            sales_velocity_bps: 5_000,
            time_elapsed: 12,
            dignity_score: 90,
        })
        .unwrap();

        assert_eq!(v0.final_price, 120_000_000_000);
        assert_eq!(v50.final_price, 4_109_890_666);
        assert_eq!(v90.final_price, 997_977_140);
    }

    #[test]
    fn rejects_invalid_input_ranges() {
        let err = calculate_vrgda_quote(VrgdaInput {
            initial_price: 1,
            sales_velocity_bps: 1_000,
            time_elapsed: 1,
            dignity_score: 101,
        })
        .unwrap_err();
        assert_eq!(err, VrgdaMathError::InvalidDignityScore);

        let err = calculate_vrgda_quote(VrgdaInput {
            initial_price: 1,
            sales_velocity_bps: -10_000,
            time_elapsed: 1,
            dignity_score: 10,
        })
        .unwrap_err();
        assert_eq!(err, VrgdaMathError::InvalidSalesVelocity);

        let err = calculate_vrgda_quote(VrgdaInput {
            initial_price: 1,
            sales_velocity_bps: 1_000,
            time_elapsed: MAX_TIME_ELAPSED_SECS + 1,
            dignity_score: 10,
        })
        .unwrap_err();
        assert_eq!(err, VrgdaMathError::InvalidTimeElapsed);
    }
}
