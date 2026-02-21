use unforgiven_v2::unforgiven_math::{
    calculate_vrgda_quote, VrgdaInput, VrgdaMathError, MAX_TIME_ELAPSED_SECS,
};

#[test]
fn one_year_time_elapsed_is_rejected_instead_of_infinity_fallback() {
    let one_year_secs = 31_536_000u64;
    let err = calculate_vrgda_quote(VrgdaInput {
        initial_price: 1_000_000_000,
        sales_velocity_bps: 5_000,
        time_elapsed: one_year_secs,
        dignity_score: 50,
    })
    .unwrap_err();

    assert_eq!(err, VrgdaMathError::InvalidTimeElapsed);
}

#[test]
fn max_age_boundary_is_still_supported() {
    let quote = calculate_vrgda_quote(VrgdaInput {
        initial_price: 1_000_000_000,
        sales_velocity_bps: 0,
        time_elapsed: MAX_TIME_ELAPSED_SECS,
        dignity_score: 90,
    })
    .unwrap();

    assert!(!quote.is_infinite);
    assert!(quote.final_price > 0);
}
