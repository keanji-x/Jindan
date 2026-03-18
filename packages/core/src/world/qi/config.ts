// ============================================================
// Qi Config — rules of ambient and conservation
// ============================================================

export const QI_CONFIG = {
  totalQi: 100_000,
  initialAmbientRatio: 0.9,

  /** 被动流失公式: baseQiDrain × ln(1 + Q_total / Q_ambient) */
  drainFormula: (baseQiDrain: number, qTotal: number, qAmbient: number): number => {
    const ambient = Math.max(qAmbient, 1);
    return baseQiDrain * Math.log(1 + qTotal / ambient);
  },
} as const;
