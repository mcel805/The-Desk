# Dynamic liquidity display · 9 October 2026 Pacific

The local Crypto Day Desk displays retained liquidity from the active chart timeframe and every higher timeframe. All seven source frames remain calculated; display filtering does not change pool prices, consumption rules, decision evidence, paper risk gates or order state.

| Chart | Eligible liquidity |
|---|---|
| 1M | 1M, 5M, 15M, 30M, 1H, 4H, Daily |
| 5M | 5M, 15M, 30M, 1H, 4H, Daily |
| 15M | 15M, 30M, 1H, 4H, Daily |
| 30M | 30M, 1H, 4H, Daily |
| 1H | 1H, 4H, Daily |
| 4H | 4H, Daily |
| Daily | Daily |

The shared visibility rule covers raw lines, pocket bands, timeframe tags and clickable hunt lines. Active and retired display convergence is calculated using eligible frames only. Hidden lower frames cannot create a convergence highlight on a higher chart. Manual horizontal hunt drawings remain available. Existing session selections are retained even when their source timeframe is hidden; the sidebar still allows their removal.

The former fixed scope control is replaced with Chart + higher. Legacy saved scope values cannot override this rule. The legend lists eligible liquidity timeframes. During a timeframe switch, the chart reuses the completed source bundle for the new frame instead of drawing the prior frame's overlay while waiting for network refresh.

Existing source retention and expired/consumed-level history settings still apply; this is not unlimited historical data retrieval. Pine v1.14 is unchanged.

Validation: three focused tests cover all seven native render scopes, unchanged raw source pools, hidden-frame convergence and ended history. Eleven geometry regression tests and the existing Wave Court assertions also pass; changed JavaScript syntax and focused whitespace checks pass. Browser verified the 1H and 5M legend, visible lines and accessible hunt controls on Coinbase BTC-USD. No session, paid Jev inference or order was started.

[Open Day Desk](http://127.0.0.1:8770/crypto-day.html?strategy=day). Runtime captures and validation notes are preserved in the MYM chart workspace under Charts/Analysis.
