# Type Alias: SDKEvent

> **SDKEvent** = \{ `entry`: [`MoodEntry`](../interfaces/MoodEntry.md); `type`: `"mood:logged"`; \} \| \{ `streak`: [`MoodStreak`](../interfaces/MoodStreak.md); `type`: `"mood:streak_updated"`; \} \| \{ `tx`: [`StellarTransaction`](../interfaces/StellarTransaction.md); `type`: `"stellar:transfer_sent"`; \} \| \{ `tx`: [`StellarTransaction`](../interfaces/StellarTransaction.md); `type`: `"stellar:transfer_received"`; \} \| \{ `profile`: [`UserProfile`](../interfaces/UserProfile.md); `type`: `"auth:signed_in"`; \} \| \{ `type`: `"auth:signed_out"`; \}

Defined in: [packages/js/core/src/types.ts:137](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/core/src/types.ts#L137)
