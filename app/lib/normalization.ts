/**
 * Z-score normalization for audio feature vectors.
 *
 * Normalization ensures that features with large magnitude ranges
 * (e.g., the first MFCC coefficient) don't dominate cosine distance.
 *
 * Stats are computed once across the full dataset by the
 * `scripts/compute-norm-stats.ts` script and stored in the DB.
 * At query time, the same stats are applied to normalize the
 * user's recording vector before searching.
 */

import { FEATURE_DIM } from "./audio-features";

export interface NormStats {
  mean: number[];
  std: number[];
}

/** Apply z-score normalization: (x - mean) / std */
export function normalize(vector: number[], stats: NormStats): number[] {
  if (vector.length !== stats.mean.length) {
    throw new Error(
      `Vector dimension mismatch: got ${vector.length}, expected ${stats.mean.length}`
    );
  }

  return vector.map((val, i) => {
    const s = stats.std[i];
    // Avoid division by zero — if std is 0, the feature is constant
    if (s === 0 || Number.isNaN(s)) return 0;
    return (val - stats.mean[i]) / s;
  });
}

/**
 * Compute normalization stats from a set of vectors.
 * Used by the compute-norm-stats script.
 */
export function computeStats(vectors: number[][]): NormStats {
  const dim = vectors[0]?.length ?? FEATURE_DIM;
  const n = vectors.length;

  if (n === 0) {
    return {
      mean: new Array(dim).fill(0),
      std: new Array(dim).fill(1),
    };
  }

  // Compute mean
  const mean = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      mean[i] += vec[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    mean[i] /= n;
  }

  // Compute std
  const variance = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      const diff = vec[i] - mean[i];
      variance[i] += diff * diff;
    }
  }
  const std = variance.map((v) => Math.sqrt(v / n));

  return { mean, std };
}
