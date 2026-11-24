import { randomInt } from "node:crypto";

export function randomPublicId(): number {
  const length = randomInt(6, 9);
  const minimum = 10 ** (length - 1);
  const maximum = 10 ** length - 1;
  return randomInt(minimum, maximum + 1);
}
