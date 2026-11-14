"""Dekad arithmetic. A dekad is days 1-10, 11-20, 21-end of a month."""
import calendar
from datetime import date, timedelta


def dekad_of(d):
    """Return (start, end) of the dekad containing date d."""
    if d.day <= 10:
        return date(d.year, d.month, 1), date(d.year, d.month, 10)
    if d.day <= 20:
        return date(d.year, d.month, 11), date(d.year, d.month, 20)
    return date(d.year, d.month, 21), date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def previous_dekad(start):
    return dekad_of(start - timedelta(days=1))


def last_complete_dekads(today, n=6, lag_days=3):
    """The n most recent dekads whose end date is at least lag_days before today.

    NASA POWER PRECTOTCORR lags real time by a few days; WaPOR dekads appear
    about a week after the dekad closes. lag_days protects against publishing
    a dekad with missing tail days.
    """
    cutoff = today - timedelta(days=lag_days)
    start, end = dekad_of(cutoff)
    if end > cutoff:
        start, end = previous_dekad(start)
    out = []
    for _ in range(n):
        out.append((start, end))
        start, end = previous_dekad(start)
    return list(reversed(out))
