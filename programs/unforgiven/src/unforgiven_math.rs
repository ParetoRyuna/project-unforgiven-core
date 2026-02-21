const BPS_SCALE: i64 = 10_000;
const FIXED_POINT_SCALE: u128 = 1_000_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VrgdaMathError {
    InvalidSalesVelocity,
    Overflow,
}

/// Exponential VRGDA pricing:
/// price(t) = initial_price * (1 + sales_velocity / 10_000) ^ time_elapsed
///
/// `sales_velocity` is in basis points per time unit.
/// Example: 1000 = +10% growth per unit, -500 = -5% decay per unit.
pub fn calculate_vrgda_price(
    initial_price: u64,
    sales_velocity: i64,
    time_elapsed: u64,
) -> Result<u64, VrgdaMathError> {
    if initial_price == 0 || time_elapsed == 0 || sales_velocity == 0 {
        return Ok(initial_price);
    }

    if sales_velocity <= -BPS_SCALE {
        return Err(VrgdaMathError::InvalidSalesVelocity);
    }

    let growth_numerator = (BPS_SCALE as i128)
        .checked_add(sales_velocity as i128)
        .ok_or(VrgdaMathError::Overflow)?;
    if growth_numerator <= 0 {
        return Err(VrgdaMathError::InvalidSalesVelocity);
    }

    let per_step_growth_fp = (growth_numerator as u128)
        .checked_mul(FIXED_POINT_SCALE)
        .ok_or(VrgdaMathError::Overflow)?
        .checked_div(BPS_SCALE as u128)
        .ok_or(VrgdaMathError::Overflow)?;

    let growth_factor_fp = pow_fixed(per_step_growth_fp, time_elapsed)?;

    let price_u128 = (initial_price as u128)
        .checked_mul(growth_factor_fp)
        .ok_or(VrgdaMathError::Overflow)?
        .checked_div(FIXED_POINT_SCALE)
        .ok_or(VrgdaMathError::Overflow)?;

    u64::try_from(price_u128).map_err(|_| VrgdaMathError::Overflow)
}

fn pow_fixed(mut base_fp: u128, mut exponent: u64) -> Result<u128, VrgdaMathError> {
    let mut result_fp = FIXED_POINT_SCALE;

    while exponent > 0 {
        if (exponent & 1) == 1 {
            result_fp = result_fp
                .checked_mul(base_fp)
                .ok_or(VrgdaMathError::Overflow)?
                .checked_div(FIXED_POINT_SCALE)
                .ok_or(VrgdaMathError::Overflow)?;
        }

        exponent >>= 1;
        if exponent > 0 {
            base_fp = base_fp
                .checked_mul(base_fp)
                .ok_or(VrgdaMathError::Overflow)?
                .checked_div(FIXED_POINT_SCALE)
                .ok_or(VrgdaMathError::Overflow)?;
        }
    }

    Ok(result_fp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_initial_price_when_time_is_zero() {
        let price = calculate_vrgda_price(1_000_000_000, 1_500, 0).unwrap();
        assert_eq!(price, 1_000_000_000);
    }

    #[test]
    fn returns_initial_price_when_velocity_is_zero() {
        let price = calculate_vrgda_price(500_000_000, 0, 120).unwrap();
        assert_eq!(price, 500_000_000);
    }

    #[test]
    fn grows_exponentially_for_positive_velocity() {
        // 100_000 * 1.1^3 = 133_100
        let price = calculate_vrgda_price(100_000, 1_000, 3).unwrap();
        assert_eq!(price, 133_100);
    }

    #[test]
    fn decays_exponentially_for_negative_velocity() {
        // 100_000 * 0.95^2 = 90_250
        let price = calculate_vrgda_price(100_000, -500, 2).unwrap();
        assert_eq!(price, 90_250);
    }

    #[test]
    fn rejects_velocity_below_negative_one_hundred_percent() {
        let err = calculate_vrgda_price(100_000, -10_000, 1).unwrap_err();
        assert_eq!(err, VrgdaMathError::InvalidSalesVelocity);
    }

    #[test]
    fn detects_overflow() {
        let err = calculate_vrgda_price(u64::MAX, 5_000, 128).unwrap_err();
        assert_eq!(err, VrgdaMathError::Overflow);
    }
}
