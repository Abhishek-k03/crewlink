// IMO numbers carry a check digit: multiply the first six digits by 7,6,5,4,3,2,
// sum them, and the last digit of that sum is the seventh digit. Checking it
// catches transposed digits that a plain "seven numeric characters" test would miss.

export function imoCheckDigit(firstSixDigits: string): number {
  let sum = 0;
  for (let index = 0; index < 6; index += 1) {
    sum += Number(firstSixDigits[index]) * (7 - index);
  }
  return sum % 10;
}

export function isValidImoNumber(value: string): boolean {
  if (!/^\d{7}$/.test(value)) return false;
  return imoCheckDigit(value.slice(0, 6)) === Number(value[6]);
}
