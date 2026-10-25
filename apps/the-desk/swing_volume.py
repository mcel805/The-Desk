"""Causal Market Synth defaults and venue-volume evidence. No entry decisions.

Synth A/B are the Desk's independent Pine reconstructions, not proprietary Cipher.
All inputs are completed standard 1m candles; a gap resets every rolling statistic.
"""
from collections import deque
from copy import deepcopy
import hashlib
from pathlib import Path
from swing_tracker import valid_bar

VERSION = 'swing-volume.1'
SETTINGS = {'ema_lengths': [5, 11, 15, 18, 21, 24, 28, 34], 'rsi': 14,
            'wave_channel': 9, 'wave_average': 12, 'wave_signal': 3,
            'flow_length': 60, 'flow_scale': 150, 'flow_offset': 2.5,
            'stoch_length': 40, 'stoch_k': 3, 'stoch_d': 3,
            'pivot_sides': 2, 'relative_volume_prior_bars': 20, 'cmf': 20,
            'mfi': 14, 'high_volume': 1.8, 'low_volume': .7,
            'exhaustion_rsi': 70, 'compression_atr': .35, 'wick_body': 1.5}
PINE_HASHES = {k: hashlib.sha256((Path(__file__).parent / 'web' / 'pine-examples' /
                ('market-cipher-' + k + '.pine')).read_bytes()).hexdigest() for k in ('a', 'b')}


class Average:
    def __init__(self, n, kind='sma'):
        self.n = n; self.kind = kind; self.values = deque(maxlen=n); self.value = None

    def feed(self, value):
        if value is None:
            return None
        self.values.append(value)
        if self.value is None or self.kind == 'sma':
            self.value = sum(self.values) / self.n if len(self.values) == self.n else None
        else:
            alpha = 1 / self.n if self.kind == 'rma' else 2 / (self.n + 1)
            self.value += alpha * (value - self.value)
        return self.value


def up(a, b, pa, pb):
    return None not in (a, b, pa, pb) and a > b and pa <= pb


class SwingVolume:
    def __init__(self, symbol, tick):
        self.symbol = symbol; self.tick = tick; self.resets = 0
        self.reset()

    def reset(self):
        self.bars = deque(maxlen=1000); self.rows = deque(maxlen=1000)
        self.count = 0; self.first = None; self.last = None; self.prev = None
        self.ema = [Average(n, 'ema') for n in SETTINGS['ema_lengths']]
        self.atr = Average(14, 'rma'); self.gain = Average(14, 'rma'); self.loss = Average(14, 'rma')
        self.esa = Average(9, 'ema'); self.dev = Average(9, 'ema'); self.main = Average(12, 'ema')
        self.signal = Average(3); self.flow = Average(60); self.rsi_window = deque(maxlen=40)
        self.k = Average(3); self.d = Average(3); self.pivot_low = None; self.pivot_high = None

    def feed(self, bar):
        valid_bar(bar)
        if self.last is not None and bar['time'] <= self.last:
            raise ValueError('Volume evidence requires append-only bars')
        if self.last is not None and bar['time'] != self.last + 60000:
            self.resets += 1; self.reset()
        b = dict(bar); previous = self.bars[-1] if self.bars else None
        prior = list(self.bars)[-20:]
        o, h, l, c, v = (b[k] for k in ('open', 'high', 'low', 'close', 'volume'))
        span = h - l; pressure = (c - o) / span if span else 0
        location = (2 * c - h - l) / span if span else 0
        typical = (h + l + c) / 3
        avg_volume = sum(x['volume'] for x in prior) / 20 if len(prior) == 20 else None
        rvol = v / avg_volume if avg_volume else None
        ribbon = [a.feed(c) for a in self.ema]
        tr = max(span, abs(h - previous['close']), abs(l - previous['close'])) if previous else span
        atr = self.atr.feed(tr)
        delta = c - previous['close'] if previous else None
        gain = self.gain.feed(max(delta, 0) if delta is not None else None)
        loss = self.loss.feed(max(-delta, 0) if delta is not None else None)
        rsi = None if gain is None else (100 if loss == 0 else 100 - 100 / (1 + gain / loss))
        esa = self.esa.feed(typical)
        dev = self.dev.feed(abs(typical - esa) if esa is not None else None)
        # The Pine ternary dev > 0 ? ... : 0 seeds the wave with zero during warmup.
        ci = (typical - esa) / (.015 * dev) if dev is not None and dev > 0 else 0
        main = self.main.feed(ci); signal = self.signal.feed(main)
        flow = self.flow.feed(pressure * 150)
        flow = None if flow is None else flow - 2.5
        if rsi is not None:
            self.rsi_window.append(rsi)
        stoch = 50
        # Desk Pine lowest/highest require 40 chart bars, then ignore the earlier RSI na prefix.
        if self.count >= 39 and self.rsi_window:
            lo, hi = min(self.rsi_window), max(self.rsi_window)
            stoch = 100 * (rsi - lo) / (hi - lo) if hi > lo else 50
        k = self.k.feed(stoch); d = self.d.feed(k)
        a_signals = []; b_signals = []; divergences = []
        prev = self.prev
        if prev and rsi is not None and ribbon[-1] is not None:
            pe = prev['a']['ema']; pr = prev['b']['rsi']
            if up(rsi, 50, pr, 50) and c > ribbon[-1]: a_signals.append('green_circle')
            if up(ribbon[1], ribbon[-1], pe[1], pe[-1]): a_signals.append('blue_triangle')
            if up(ribbon[0], ribbon[1], pe[0], pe[1]) and ribbon[0] >= ribbon[-1]: a_signals.append('yellow_diamond')
            if up(ribbon[1], ribbon[0], pe[1], pe[0]):
                a_signals.append('blood_diamond' if pr is not None and pr > 70 and c < ribbon[3] else 'red_diamond')
            if up(ribbon[-1], ribbon[1], pe[-1], pe[1]): a_signals.append('red_x')
            if up(70, rsi, 70, pr) and atr and abs(ribbon[0] - ribbon[-1]) < atr * .35 and h - max(o, c) > max(abs(c - o), self.tick) * 1.5:
                a_signals.append('yellow_x')
        ready = None not in (main, signal, flow, rsi)
        if prev and ready:
            pm, ps = prev['b']['main'], prev['b']['signal']
            if up(main, signal, pm, ps):
                b_signals.append('bull_cross')
                if signal <= -60: b_signals.append('oversold_cross')
            if up(signal, main, ps, pm):
                b_signals.append('bear_cross')
                if signal >= 60: b_signals.append('overbought_cross')
        row = {'time': b['time'], 'known_at': b['time'] + 60000,
               'a': {'ema': ribbon, 'ribbon': None if ribbon[-1] is None else ('bull' if ribbon[0] >= ribbon[-1] else 'bear'),
                     'width_atr': abs(ribbon[0] - ribbon[-1]) / atr if atr and ribbon[-1] is not None else None, 'signals': a_signals},
               'b': {'main': main, 'signal': signal, 'fast': main - signal if signal is not None else None,
                     'flow_proxy': flow, 'rsi': rsi, 'stoch_k': k, 'stoch_d': d, 'signals': b_signals, 'divergences': divergences},
               'volume': {'raw': v, 'relative': rvol, 'prior_mean': avg_volume, 'cmf': None, 'mfi': None,
                          'close_location': location, 'body_pressure': pressure,
                          'signed_close_volume_proxy': (v if delta > 0 else -v if delta < 0 else 0) if delta is not None else None},
               'tags': []}
        # Oscillator pivots use two bars to the right. Record detection now, with both origins.
        window = [*list(self.rows)[-4:], row]
        if ready and len(window) == 5 and all(x['b']['signal'] is not None for x in window):
            pivot = window[2]; wave = pivot['b']['signal']; price = list(self.bars)[-2]
            for side, field, extreme in (('low', 'low', min), ('high', 'high', max)):
                values = [x['b']['signal'] for x in window]
                # Pine chooses the latest occurrence when a pivot level ties.
                if wave != extreme(values) or any(x == wave for x in values[3:]): continue
                old = getattr(self, 'pivot_' + side)
                current = {'origin': pivot['time'], 'wave': wave, 'price': price[field]}
                if old and ((side == 'low' and wave > old['wave'] and current['price'] < old['price']) or
                            (side == 'high' and wave < old['wave'] and current['price'] > old['price'])):
                    label = 'bull_divergence' if side == 'low' else 'bear_divergence'
                    b_signals.append(label); divergences.append({'kind': label, 'previous': old, 'pivot': current, 'known_at': row['known_at']})
                setattr(self, 'pivot_' + side, current)
        self.bars.append(b); self.rows.append(row)
        recent_bars = list(self.bars); recent_rows = list(self.rows)
        if len(recent_bars) >= 20:
            total = sum(x['volume'] for x in recent_bars[-20:])
            row['volume']['cmf'] = sum(x['volume']['close_location'] * x['volume']['raw'] for x in recent_rows[-20:]) / total if total else None
        if len(recent_bars) >= 15:
            positive = negative = 0
            for before, after in zip(recent_bars[-15:-1], recent_bars[-14:]):
                tp = sum(after[x] for x in ('high', 'low', 'close')) / 3
                pt = sum(before[x] for x in ('high', 'low', 'close')) / 3
                money = tp * after['volume']
                if tp > pt: positive += money
                elif tp < pt: negative += money
            row['volume']['mfi'] = 100 * positive / (positive + negative) if positive + negative else None
        tags = row['tags']
        if rvol is not None and v > 0:
            if rvol >= 1.8 and span > 0:
                if min(o, c) - l >= .5 * span and location >= .5: tags.append('high_volume_lower_rejection')
                if h - max(o, c) >= .5 * span and location <= -.5: tags.append('high_volume_upper_rejection')
                avg_range = sum(x['high'] - x['low'] for x in prior) / 20
                if abs(pressure) >= .6 and span >= avg_range:
                    tags.append('high_volume_expansion_up' if c > o else 'high_volume_expansion_down')
            if len(prior) >= 5 and rvol < .7:
                if h > max(x['high'] for x in prior[-5:]): tags.append('low_volume_high_extension')
                if l < min(x['low'] for x in prior[-5:]): tags.append('low_volume_low_extension')
        self.first = self.first if self.first is not None else b['time']
        self.last = b['time']; self.count += 1; self.prev = row
        return deepcopy(row)

    def snapshot(self, candidates=()):
        rows = list(self.rows); latest = rows[-1] if rows else None
        contexts = []
        for c in candidates[-4:]:
            if c['a']['known'] > (self.last or 0) + 60000 or c['b']['known'] > (self.last or 0) + 60000: continue
            def leg(start, end):
                selected = [r for r in rows if start <= r['time'] <= end]
                complete = bool(selected and selected[0]['time'] == start and selected[-1]['time'] == end)
                return {'start': start, 'end': end, 'complete': complete, 'bars': len(selected),
                        'total_volume': sum(r['volume']['raw'] for r in selected) if complete else None,
                        'mean_relative_volume': (sum(r['volume']['relative'] for r in selected) / len(selected))
                        if complete and all(r['volume']['relative'] is not None for r in selected) else None}
            contexts.append({'candidate_id': c['id'], 'profile': c['profile'],
                             'ab': leg(c['a']['origin'], c['b']['origin']),
                             'developing_bc': leg(c['b']['origin'], self.last)})
        return {'version': VERSION, 'status': 'READY' if latest and latest['b']['flow_proxy'] is not None else 'WARMUP',
                'source': {'symbol': self.symbol, 'provider': 'Hyperliquid public REST candleSnapshot',
                           'timeframe': '1m', 'candle_type': 'standard OHLC', 'volume_field': 'provider candle v; venue-local units',
                           'history_start': self.first, 'completed_cutoff': self.last + 60000 if self.last is not None else None,
                           'processed_bars': self.count, 'gap_resets': self.resets, 'pine_sha256': PINE_HASHES},
                'settings': deepcopy(SETTINGS), 'latest': deepcopy(latest), 'recent': deepcopy(rows[-24:]),
                'candidate_legs': contexts,
                'interpretation': 'A/B are price-derived Desk reconstructions at fixed defaults, independent of chart settings. '
                                  'B flow is an OHLC proxy; fast wave is not VWAP. Raw volume is venue-local; CMF, MFI and signed volume '
                                  'are proxies, not aggressor delta or capital flows. Tags are unvalidated hypotheses, not reversal confirmation.'}
