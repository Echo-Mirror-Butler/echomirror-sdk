use std::time::Duration;

/// Full-jitter exponential backoff: each delay is a uniform random duration in
/// `[0, min(max, min * 2^attempt)]`, per the classic AWS full-jitter strategy.
#[derive(Debug, Clone)]
pub struct Backoff {
    min: Duration,
    max: Duration,
    attempt: u32,
}

impl Backoff {
    pub fn new(min: Duration, max: Duration) -> Self {
        Self {
            min,
            max,
            attempt: 0,
        }
    }

    /// The next delay to sleep. Advances the attempt counter.
    pub fn next_delay(&mut self) -> Duration {
        let delay = self.next_delay_with(rand::random::<f64>());
        self.attempt = self.attempt.saturating_add(1);
        delay
    }

    /// Deterministic core of `next_delay` — `unit` must be in `[0, 1)`.
    /// Exposed for tests with an injected random value.
    pub fn next_delay_with(&self, unit: f64) -> Duration {
        let ceiling = self.ceiling();
        ceiling.mul_f64(unit.clamp(0.0, 1.0))
    }

    /// The current (un-jittered) ceiling: `min(max, min * 2^attempt)`.
    pub fn ceiling(&self) -> Duration {
        let exp = self.attempt.min(32);
        let scaled = self.min.saturating_mul(2u32.saturating_pow(exp));
        scaled.min(self.max)
    }

    /// Reset after a successful operation so the next failure starts small.
    pub fn reset(&mut self) {
        self.attempt = 0;
    }

    pub fn attempt(&self) -> u32 {
        self.attempt
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ceiling_doubles_until_capped() {
        let mut b = Backoff::new(Duration::from_millis(500), Duration::from_secs(60));
        let mut ceilings = Vec::new();
        for _ in 0..10 {
            ceilings.push(b.ceiling());
            b.next_delay();
        }
        assert_eq!(ceilings[0], Duration::from_millis(500));
        assert_eq!(ceilings[1], Duration::from_secs(1));
        assert_eq!(ceilings[2], Duration::from_secs(2));
        assert_eq!(ceilings[7], Duration::from_secs(60)); // 500ms * 2^7 = 64s → capped
        assert_eq!(ceilings[9], Duration::from_secs(60));
    }

    #[test]
    fn jitter_stays_within_ceiling() {
        let b = Backoff::new(Duration::from_millis(500), Duration::from_secs(60));
        assert_eq!(b.next_delay_with(0.0), Duration::ZERO);
        assert_eq!(b.next_delay_with(1.0), Duration::from_millis(500));
        assert_eq!(b.next_delay_with(0.5), Duration::from_millis(250));
    }

    #[test]
    fn reset_returns_to_min() {
        let mut b = Backoff::new(Duration::from_millis(500), Duration::from_secs(60));
        for _ in 0..5 {
            b.next_delay();
        }
        assert!(b.ceiling() > Duration::from_millis(500));
        b.reset();
        assert_eq!(b.ceiling(), Duration::from_millis(500));
        assert_eq!(b.attempt(), 0);
    }

    #[test]
    fn attempt_overflow_is_safe() {
        let mut b = Backoff::new(Duration::from_millis(500), Duration::from_secs(60));
        for _ in 0..100 {
            b.next_delay();
        }
        assert_eq!(b.ceiling(), Duration::from_secs(60));
    }
}
