/** Checks syntax and the Israeli ID check digit; does not verify a person's identity. */
export function isValidIsraeliId(value: unknown): value is string {
  if (typeof value !== "string" || !/^[0-9]{9}$/.test(value) || value === "000000000") return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const product = Number(value[i]) * (i % 2 === 0 ? 1 : 2)
    sum += product > 9 ? product - 9 : product
  }
  return sum % 10 === 0
}

export const israeliIdError = "מספר תעודת הזהות אינו תקין. בדקו את כל 9 הספרות, כולל אפסים בתחילת המספר."
