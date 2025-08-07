// Cache-related type definitions

export interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  ttl: number;
}

export interface CacheOptions {
  ttl: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  checkPeriod?: number; // How often to check for expired entries
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  size: number;
}