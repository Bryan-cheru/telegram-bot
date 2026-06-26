import { SymbolParser } from '../src/shared/SymbolParser';

describe('SymbolParser.normalizeSymbol', () => {
  it('maps friendly names to MT5 symbols', () => {
    expect(SymbolParser.normalizeSymbol('GOLD')).toBe('XAUUSD');
    expect(SymbolParser.normalizeSymbol('SILVER')).toBe('XAGUSD');
    expect(SymbolParser.normalizeSymbol('BITCOIN')).toBe('BTCUSD');
    expect(SymbolParser.normalizeSymbol('BTC')).toBe('BTCUSD');
  });

  it('strips decoration ($, casing, punctuation)', () => {
    expect(SymbolParser.normalizeSymbol('$EURUSD')).toBe('EURUSD');
    expect(SymbolParser.normalizeSymbol('eurusd')).toBe('EURUSD');
  });
});

describe('SymbolParser.extractSymbol', () => {
  it('extracts a hashtagged symbol from signal text', () => {
    expect(SymbolParser.extractSymbol('#XAUUSD Sell Setup\nSelling Zone: 2650 - 2655')).toBe('XAUUSD');
  });

  it('extracts gold from contextual words', () => {
    expect(SymbolParser.extractSymbol('Gold is approaching the demand zone')).toBe('XAUUSD');
  });

  it('returns null when no symbol is present', () => {
    expect(SymbolParser.extractSymbol('market looks choppy today, sitting on hands')).toBeNull();
  });
});
