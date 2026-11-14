"""FAO-56 Penman-Monteith reference evapotranspiration from NASA POWER daily data.

Every input comes from one NASA POWER request per point:
  T2M_MAX, T2M_MIN (C), RH2M (%), WS2M (m/s at 2 m),
  ALLSKY_SFC_SW_DWN (MJ/m2/day), PS (kPa)

Reference: Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998), "Crop
evapotranspiration: Guidelines for computing crop water requirements",
FAO Irrigation and Drainage Paper 56. Equation numbers below are from that paper.

ET0 is the water a short, well-watered reference grass would use. Crop water
demand is ET0 multiplied by a crop coefficient Kc (see kc_wheat).
"""
import math

ALBEDO = 0.23          # reference grass
SIGMA = 4.903e-9       # Stefan-Boltzmann, MJ K^-4 m^-2 day^-1
GSC = 0.0820           # solar constant, MJ m^-2 min^-1


def sat_vapour_pressure(t_c):
    """e0(T) in kPa (Eq. 11)."""
    return 0.6108 * math.exp(17.27 * t_c / (t_c + 237.3))


def slope_vapour_curve(t_c):
    """Delta in kPa/C (Eq. 13)."""
    return 4098 * sat_vapour_pressure(t_c) / (t_c + 237.3) ** 2


def elevation_from_pressure(p_kpa):
    """Station elevation in m implied by mean surface pressure (inverse of Eq. 7)."""
    if not p_kpa or p_kpa <= 0:
        return 0.0
    return 44330.0 * (1 - (p_kpa / 101.325) ** (1 / 5.255))


def extraterrestrial_radiation(lat_deg, doy):
    """Ra in MJ m^-2 day^-1 (Eq. 21)."""
    phi = math.radians(lat_deg)
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365.0)              # Eq. 23
    decl = 0.409 * math.sin(2 * math.pi * doy / 365.0 - 1.39)          # Eq. 24
    x = -math.tan(phi) * math.tan(decl)
    ws = math.acos(min(1.0, max(-1.0, x)))                             # Eq. 25
    return (24 * 60 / math.pi) * GSC * dr * (
        ws * math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.sin(ws))


def et0_daily(t_max, t_min, rh_mean, wind_2m, rs, pressure_kpa, lat_deg, doy):
    """Reference evapotranspiration in mm/day (Eq. 6). Returns None if an input is missing."""
    if None in (t_max, t_min, rh_mean, wind_2m, rs, pressure_kpa):
        return None
    t_mean = (t_max + t_min) / 2.0
    delta = slope_vapour_curve(t_mean)
    gamma = 0.665e-3 * pressure_kpa                                     # Eq. 8
    es = (sat_vapour_pressure(t_max) + sat_vapour_pressure(t_min)) / 2.0  # Eq. 12
    ea = es * max(0.0, min(100.0, rh_mean)) / 100.0                     # Eq. 19
    z = elevation_from_pressure(pressure_kpa)
    ra = extraterrestrial_radiation(lat_deg, doy)
    rso = (0.75 + 2e-5 * z) * ra                                        # Eq. 37
    rns = (1 - ALBEDO) * rs                                             # Eq. 38
    ratio = 1.0 if rso <= 0 else min(1.0, max(0.25, rs / rso))
    rnl = (SIGMA * (((t_max + 273.16) ** 4 + (t_min + 273.16) ** 4) / 2.0)
           * (0.34 - 0.14 * math.sqrt(max(0.0, ea)))
           * (1.35 * ratio - 0.35))                                     # Eq. 39
    rn = rns - rnl
    u2 = max(0.5, wind_2m)                                              # Eq. 6 note: u2 floor
    num = 0.408 * delta * rn + gamma * (900.0 / (t_mean + 273.0)) * u2 * (es - ea)
    den = delta + gamma * (1 + 0.34 * u2)
    return max(0.0, num / den)


# --- crop coefficient -------------------------------------------------------
# FAO-56 Table 12 for winter wheat, with the stage lengths of Rabi wheat in the
# Peshawar valley (sown about 1 November, harvested late April).
WHEAT_STAGES = [
    (0, 20, 0.40, 0.40),      # initial: emergence
    (20, 60, 0.40, 1.15),     # development: tillering to jointing
    (60, 130, 1.15, 1.15),    # mid season: booting to grain fill
    (130, 175, 1.15, 0.35),   # late season: ripening to harvest
]
WHEAT_SOWING = (11, 1)        # 1 November


def days_after_sowing(d, sowing=WHEAT_SOWING):
    import datetime
    year = d.year if (d.month, d.day) >= sowing else d.year - 1
    return (d - datetime.date(year, sowing[0], sowing[1])).days


def kc_wheat(d):
    """Crop coefficient for Rabi wheat on date d (FAO-56 linear stage interpolation)."""
    das = days_after_sowing(d)
    if das < 0 or das > WHEAT_STAGES[-1][1]:
        return None                      # outside the wheat season
    for start, end, kc_start, kc_end in WHEAT_STAGES:
        if start <= das <= end:
            if kc_start == kc_end:
                return kc_start
            f = (das - start) / float(end - start)
            return round(kc_start + f * (kc_end - kc_start), 3)
    return None
