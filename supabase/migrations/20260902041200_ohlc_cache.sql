-- Cache of 1-minute OHLC bars per (symbol, trade_date), fetched from the market
-- data provider. A closed day's bars are immutable, so this cache is permanent and
-- keeps us well under the provider's free-tier rate limit.
create table if not exists ohlc_cache (
  symbol      text not null,
  trade_date  text not null,          -- YYYY-MM-DD (ET session date)
  bars        jsonb not null,         -- [{ t: unixSec, o, h, l, c, v }, ...]
  source      text not null default 'massive',
  fetched_at  text not null default (now()::text),
  primary key (symbol, trade_date)
);
