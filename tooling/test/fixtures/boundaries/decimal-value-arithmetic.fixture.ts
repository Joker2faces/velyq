declare const odds: {
  readonly value: string & { readonly __brand: "DecimalString" };
};

export const invalidCalculation = odds.value + odds.value;
