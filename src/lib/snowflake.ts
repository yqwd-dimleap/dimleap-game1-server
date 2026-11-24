const EPOCH_MS = 1_704_067_200_000n; // 2024-01-01T00:00:00Z
const WORKER_BITS = 5n;
const DATACENTER_BITS = 5n;
const SEQUENCE_BITS = 12n;
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;
export const MAX_SIGNED_INT64 = (1n << 63n) - 1n;

export class SnowflakeGenerator {
  private lastTimestamp = -1n;
  private sequence = 0n;

  constructor(
    private readonly workerId: number,
    private readonly datacenterId: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(workerId) || workerId < 0 || workerId > 31) throw new Error("Invalid snowflake worker ID");
    if (!Number.isInteger(datacenterId) || datacenterId < 0 || datacenterId > 31) {
      throw new Error("Invalid snowflake datacenter ID");
    }
  }

  next(): bigint {
    let timestamp = BigInt(this.now());
    if (timestamp < this.lastTimestamp) {
      const drift = this.lastTimestamp - timestamp;
      if (drift > 5n) throw new Error("Clock moved backwards while generating snowflake ID");
      timestamp = this.lastTimestamp;
    }
    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;
      if (this.sequence === 0n) {
        while (timestamp <= this.lastTimestamp) timestamp = BigInt(this.now());
      }
    } else {
      this.sequence = 0n;
    }
    this.lastTimestamp = timestamp;
    const id = (
      ((timestamp - EPOCH_MS) << (WORKER_BITS + DATACENTER_BITS + SEQUENCE_BITS)) |
      (BigInt(this.datacenterId) << (WORKER_BITS + SEQUENCE_BITS)) |
      (BigInt(this.workerId) << SEQUENCE_BITS) |
      this.sequence
    );
    if (id <= 0n || id > MAX_SIGNED_INT64) {
      throw new Error("Snowflake ID is outside signed Int64 range");
    }
    return id;
  }
}

export function snowflakeString(value: bigint): string {
  if (value <= 0n || value > MAX_SIGNED_INT64) throw new Error("Snowflake ID is outside signed Int64 range");
  return value.toString();
}
