---
title: "Making Your First Trade"
description: "What actually happens between clicking buy and owning a share - order types, fills, settlement, and the mistakes that cost real money."
difficulty: beginner
time: 10
tags: ["getting-started", "order-types", "limit-order", "market-order", "beginner"]
prerequisites: "A funded account (see the account-opening guide) and a specific ticker in mind. Do not do this to 'see what happens' with money you need."
steps:
  - title: "Check the market is actually open"
    summary: "Regular hours are 9:30am-4:00pm ET. Outside them you are trading thin volume at bad prices unless you meant to."
  - title: "Look up the ticker, not the company name"
    summary: "Search the symbol. Same-named companies and lookalike tickers are a real source of wrong purchases."
  - title: "Choose limit over market on anything you are unsure about"
    summary: "A limit says 'this price or better'. A market says 'whatever it costs right now'."
  - title: "Set quantity in dollars if the share is expensive"
    summary: "Fractional support means a $700 share is reachable on $50. Without it, you are priced out of good companies for silly reasons."
  - title: "Read the preview screen before submitting"
    summary: "It shows shares, estimated price, total, and order type. This is the only free place to catch a mistake."
  - title: "Confirm the fill and understand settlement"
    summary: "The trade prints instantly; ownership finalises a business day later. Your broker's own docs state its exact rule."
key_takeaways:
  - "Market orders guarantee execution, never price. On liquid index funds that gap is trivial; on a quiet small-cap it can be several percent."
  - "Trade during regular hours (9:30am-4:00pm ET). Pre-market and after-hours spreads are wide and the other side is often someone far better informed than you."
  - "Always read the confirmation preview. Buying 100 instead of 10, or AMC instead of AMCX, is caught in exactly one place."
  - "A displayed price is a quote, not a promise. Between seeing it and submitting it, the price moved."
  - "Settlement lags the trade by roughly a business day for stocks: the deal is agreed immediately, ownership and cash finalise after. Check your broker's stated rule rather than trusting any guide, including this one."
try_it_yourself: "Place a limit order 1-2% below the current price on something small, then watch it sit unfilled all day. That is the whole lesson: a limit protects your price and happily does nothing forever if the market refuses to meet it."
further_reading:
  - title: "SEC Investor.gov - Introduction to Investing"
    url: "https://www.investor.gov/introduction-investing"
    description: "Plain-language overview of order types and how markets match buyers to sellers."
  - title: "FINRA BrokerCheck"
    url: "https://brokercheck.finra.org/"
    description: "Verify any broker-dealer before trusting it with your details."
---

## <a id="step-1"></a>Check the market is actually open

Regular trading hours are **9:30am to 4:00pm Eastern**, Monday to Friday, closed on market
holidays. Some brokers let you trade pre-market (from 4am) and after-hours (to 8pm), but that
is not a free extension of the day.

Fewer people are trading then, which means fewer bids and offers sitting close together. The
gap between what a buyer will pay and a seller will accept - the *spread* - gets wider, and
you pay some of it. Volume is also thin enough that a single decent-size order can move the
price visibly.

For a first trade there is no reason to touch either session. There's no edge available to you
at 5:15am and the pricing is worse for the privilege.

## <a id="step-2"></a>Look up the ticker, not the company name

Search the **symbol** and confirm the company name printed under it matches what you intended.

This sounds obvious until you notice how many similar symbols exist. Searching a brand name can
surface a different company operating in the same industry, an ETF tracking that sector, or a
share class with different voting rights. Two-letter and three-letter symbols get reused across
markets and reissued after bankruptcies.

Check three things on the quote page: the full legal-ish company name, the exchange it trades
on, and whether you're looking at a fund or a single company.

## <a id="step-3"></a>Choose limit over market on anything you are unsure about

Two order types cover nearly everything you'll do:

**Market order** - "buy this now at whatever the best available price is." It will execute. It
also has no opinion about the price, so if the market jumps in the half-second your order is
in flight, you pay the jump.

**Limit order** - "buy this, but no higher than $X." If the market won't reach $X, you don't
buy. You're protected from bad fills at the cost of possibly not trading at all.

On a huge, heavily-traded index fund where millions of shares change hands per minute, a market
order is fine - the spread is a rounding error. On a thinly-traded small company, the spread can
be a meaningful percentage, and a market order pays it without complaint.

Default to limit while you're learning. The worst outcome is an unfilled order you can cancel
and retry. With a market order the worst outcome is a fill you can't take back.

## <a id="step-4"></a>Set quantity in dollars if the share is expensive

If a company trades at $700 a share and you have $50, historically you simply couldn't own
it. Fractional shares removed that barrier - you buy $50 worth and own 0.0714 of a share.

Check whether your broker supports them. It matters more than most feature lists admit, because
without fractional shares a small account can only afford cheap stock prices, which pushes new
investors toward junk precisely because it's affordable. That's backwards: share price alone
tells you nothing about whether a company is expensive. A $5 stock can be wildly overvalued
and a $700 stock reasonable.

Dividends on fractional shares get paid proportionally, so 0.0714 shares earns 0.0714 of the
per-share dividend.

## <a id="step-5"></a>Read the preview screen before submitting

Every broker shows a review step before the order goes out. Read all of it:

- **Symbol and name** - still the company you meant?
- **Quantity** - shares or dollars, and does the number have the right number of digits?
- **Order type** - limit or market?
- **Limit price** - if you set one, is it the number you typed?
- **Estimated total and any fees** - the realistic total, not just price × quantity.
- **Time-in-force** - "day" means it dies at the close; "good till cancelled" stays alive for
  weeks and can fill when you've entirely forgotten about it.

That screen is the only free place to catch an error. After submission, cancelling an unfilled
order is easy, but reversing a completed purchase means selling again and potentially paying
more in the spread than the trade ever earned you.

## <a id="step-6"></a>Confirm the fill and understand settlement

After submitting, check the order status: **pending** means waiting, **filled** means done,
**partially filled** means some shares went through and the rest are still working, and
**cancelled** means it never executed.

Stock trades in the US now settle on a **one-business-day** cycle (the market moved to this from
a two-day cycle in 2024). In practice you'll see the position in your portfolio within seconds,
so this rarely bites. Where it does bite: if you sell something today and try to spend those
proceeds before they settle, or if you trade frequently in a cash account and trip a good-faith-
violation rule.

Exact mechanics vary slightly by broker and product, so read your own broker's settlement page
once. If anything here disagrees with it, believe the broker.

Screenshot or note your entry price and why you bought. In six months you will not remember
whether you were making a considered decision or reacting to something you saw online, and the
difference is the entire point of keeping records.

---

Educational content, not financial advice. Any specific security mentioned here is illustrative
- nothing on this page is a recommendation to buy or sell it. Trading involves risk including
losing the money you put in, and a first trade should be sized so that losing it teaches you
something rather than hurts you.
