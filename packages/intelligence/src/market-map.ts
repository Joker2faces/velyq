import {
  calculateMarketConsensus,
  type MarketConsensus,
  type MarketConsensusInput,
} from "./consensus.js";

export type MarketMap = readonly MarketConsensus[];

/** Converts neutral market observations into stable consensus DTOs. */
export function buildMarketMap(
  markets: readonly MarketConsensusInput[],
): MarketMap {
  return Object.freeze(markets.map(calculateMarketConsensus));
}
