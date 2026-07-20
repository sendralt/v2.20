#!/usr/bin/env python3
"""
FishSmart Pro - Launch Budget Projection Calculator
Run: python3 launch-projection-calculator.py

Adjust the assumptions below to model different scenarios.
"""

# ============================================================
# ASSUMPTIONS (Edit these to model scenarios)
# ============================================================

BUDGET = {
    "tools": 70,
    "influencer": 0,       # Free Pro accounts
    "giveaway": 75,
    "meta_ads": 200,
    "google_ads": 60,
    "reddit_boost": 25,
    "directories": 20,
    "reserve": 50,
}

PRICING = {
    "monthly": 4.99,
    "yearly": 29.99,
    "monthly_split": 0.30,   # 30% choose monthly
    "yearly_split": 0.70,    # 70% choose yearly
    "avg_churn_months": 8,   # Avg subscriber stays 8 months
}

# Conversion assumptions (adjust for conservative vs optimistic)
INFLUENCER = {
    "contacted": 30,
    "response_rate": 0.25,
    "content_creators": 4,       # How many actually post
    "avg_views_per_creator": 40000,
    "signup_conversion": 0.01,   # 1% of viewers sign up
    "free_to_paid": 0.10,        # 10% of signups convert to Pro
}

META_ADS = {
    "impressions": 60000,        # $200 at ~$3 CPM
    "ctr": 0.02,                 # 2% click-through
    "landing_conversion": 0.40, # 40% run a free forecast
    "free_to_paid": 0.03,        # 3% trial-to-paid
}

GOOGLE_ADS = {
    "clicks": 80,                # $60 at ~$0.75 CPC
    "landing_conversion": 0.50,
    "free_to_paid": 0.07,
}

GIVEAWAY = {
    "entries": 500,
    "trial_rate": 0.60,          # 60% run a forecast
    "free_to_paid": 0.08,
}

REDDIT = {
    "organic_clicks": 200,
    "boosted_clicks": 200,
    "landing_conversion": 0.35,
    "free_to_paid": 0.05,
}

DIRECTORIES = {
    "visitors": 1000,
    "landing_conversion": 0.30,
    "free_to_paid": 0.05,
}

RESERVE_MULTIPLIER = 1.0  # 1.0 = assume reserve performs same as avg of paid channels

# ============================================================
# CALCULATIONS
# ============================================================

def calc_subs(impressions_or_clicks, ctr=None, landing=None, paid=None, mode="ad"):
    if mode == "ad":
        clicks = impressions_or_clicks * ctr
        trials = clicks * landing
        subs = trials * paid
        return int(clicks), int(trials), int(subs)
    elif mode == "clicks":
        trials = impressions_or_clicks * landing
        subs = trials * paid
        return impressions_or_clicks, int(trials), int(subs)


def avg_revenue_per_sub(monthly, yearly, m_split, y_split, churn_months):
    monthly_rev = monthly * min(churn_months, 12)
    yearly_rev = yearly
    blended = (monthly_rev * m_split) + (yearly_rev * y_split)
    return round(blended, 2)


print("=" * 65)
print("FISHSMART PRO - LAUNCH BUDGET PROJECTION CALCULATOR")
print("=" * 65)
print()

total_budget = sum(BUDGET.values())
print(f"Total Budget: ${total_budget}")
print()

# --- Influencer ---
i_reach = INFLUENCER["content_creators"] * INFLUENCER["avg_views_per_creator"]
i_signups = int(i_reach * INFLUENCER["signup_conversion"])
i_subs = int(i_signups * INFLUENCER["free_to_paid"])
print("--- MICRO-INFLUENCER SEEDING ---")
print(f"  Creators contacted: {INFLUENCER['contacted']}")
print(f"  Response rate: {INFLUENCER['response_rate']*100:.0f}%")
print(f"  Content creators: {INFLUENCER['content_creators']}")
print(f"  Total reach: {i_reach:,} views")
print(f"  App signups: {i_signups:,}")
print(f"  Pro conversions: {i_subs} subs at $0 cost")
print()

# --- Meta Ads ---
m_clicks, m_trials, m_subs = calc_subs(
    META_ADS["impressions"], META_ADS["ctr"], META_ADS["landing_conversion"], META_ADS["free_to_paid"]
)
print("--- META ADS (Facebook/Instagram) ---")
print(f"  Budget: ${BUDGET['meta_ads']}")
print(f"  Impressions: {META_ADS['impressions']:,}")
print(f"  Clicks: {m_clicks} (CTR {META_ADS['ctr']*100:.1f}%)")
print(f"  Free trials: {m_trials}")
print(f"  Pro subs: {m_subs}")
if m_subs > 0:
    print(f"  Cost per sub: ${BUDGET['meta_ads']/m_subs:.2f}")
print()

# --- Google Ads ---
g_clicks_obj, g_trials, g_subs = calc_subs(
    GOOGLE_ADS["clicks"], None, GOOGLE_ADS["landing_conversion"], GOOGLE_ADS["free_to_paid"], mode="clicks"
)
print("--- GOOGLE ADS ---")
print(f"  Budget: ${BUDGET['google_ads']}")
print(f"  Clicks: {GOOGLE_ADS['clicks']}")
print(f"  Free trials: {g_trials}")
print(f"  Pro subs: {g_subs}")
if g_subs > 0:
    print(f"  Cost per sub: ${BUDGET['google_ads']/g_subs:.2f}")
print()

# --- Giveaway ---
gw_trials = int(GIVEAWAY["entries"] * GIVEAWAY["trial_rate"])
gw_subs = int(gw_trials * GIVEAWAY["free_to_paid"])
print("--- CONTEST / GIVEAWAY ---")
print(f"  Budget: ${BUDGET['giveaway']}")
print(f"  Entries: {GIVEAWAY['entries']}")
print(f"  Free trials: {gw_trials}")
print(f"  Pro subs: {gw_subs}")
if gw_subs > 0:
    print(f"  Cost per sub: ${BUDGET['giveaway']/gw_subs:.2f}")
print()

# --- Reddit ---
r_total_clicks = REDDIT["organic_clicks"] + REDDIT["boosted_clicks"]
r_trials = int(r_total_clicks * REDDIT["landing_conversion"])
r_subs = int(r_trials * REDDIT["free_to_paid"])
print("--- REDDIT ---")
print(f"  Budget: ${BUDGET['reddit_boost']} (boost only)")
print(f"  Total clicks: {r_total_clicks} (organic + boosted)")
print(f"  Free trials: {r_trials}")
print(f"  Pro subs: {r_subs}")
if r_subs > 0:
    print(f"  Cost per sub: ${BUDGET['reddit_boost']/r_subs:.2f}")
print()

# --- Directories ---
d_trials = int(DIRECTORIES["visitors"] * DIRECTORIES["landing_conversion"])
d_subs = int(d_trials * DIRECTORIES["free_to_paid"])
print("--- DIRECTORY SUBMISSIONS ---")
print(f"  Budget: ${BUDGET['directories']}")
print(f"  Visitors: {DIRECTORIES['visitors']:,}")
print(f"  Free trials: {d_trials}")
print(f"  Pro subs: {d_subs}")
if d_subs > 0:
    print(f"  Cost per sub: ${BUDGET['directories']/d_subs:.2f}")
print()

# --- Reserve ---
paid_subs_avg = (m_subs + g_subs + gw_subs + r_subs + d_subs) / 5
reserve_subs = int(paid_subs_avg * RESERVE_MULTIPLIER)
print("--- RESERVE FUND ---")
print(f"  Budget: ${BUDGET['reserve']}")
print(f"  Estimated subs (avg of paid channels): {reserve_subs}")
print()

# ============================================================
# GRAND TOTALS
# ============================================================

total_subs = i_subs + m_subs + g_subs + gw_subs + r_subs + d_subs + reserve_subs
total_trials = i_signups + m_trials + g_trials + gw_trials + r_trials + d_trials
blended_cac = total_budget / total_subs if total_subs > 0 else 0
arpu = avg_revenue_per_sub(
    PRICING["monthly"], PRICING["yearly"],
    PRICING["monthly_split"], PRICING["yearly_split"],
    PRICING["avg_churn_months"]
)
gross_revenue = total_subs * arpu
ltv_cac = arpu / blended_cac if blended_cac > 0 else 0

print("=" * 65)
print("GRAND TOTALS")
print("=" * 65)
print(f"  Total budget spent:            ${total_budget}")
print(f"  Total free-tier signups/trials: {total_trials:,}")
print(f"  Total Pro subscriptions:        {total_subs}")
print(f"  Blended CAC:                    ${blended_cac:.2f}")
print(f"  Avg revenue per sub (blended):  ${arpu}")
print(f"  Projected gross revenue (Y1):   ${gross_revenue:,.2f}")
print(f"  LTV:CAC ratio:                  {ltv_cac:.1f}:1")
print()
if ltv_cac >= 3:
    print(f"  STATUS: EXCELLENT - LTV:CAC above 3:1 threshold")
else:
    print(f"  WARNING: LTV:CAC below 3:1 - adjust assumptions")
print("=" * 65)
