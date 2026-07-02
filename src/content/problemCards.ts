/**
 * The problem-zoo cards, grouped as the guide displays them. Icons are string
 * ids (mapped to lucide components by the renderer) so this stays pure data.
 */

// All problems, grouped — formulas kept tiny so they fit in card layout.
export type ProblemIconId =
  | 'trending-up' | 'activity' | 'trending-down' | 'waves' | 'mountain'
  | 'percent' | 'target' | 'radio' | 'scatter-chart' | 'brain';
export type ProblemCard = { name: string; icon?: ProblemIconId; customIcon?: string; formula: string; tag: string };
export const problemCards: Record<string, ProblemCard[]> = {
  'Start in 1D': [
    { name: 'Fit a Slope', customIcon: '╱', formula: 'αX', tag: 'one parameter, one parabola' },
    { name: 'Double Well', customIcon: 'W', formula: '(α²−4)²/8 + 0.6α', tag: 'the simplest local-minimum trap' },
    { name: 'Bumpy Valley', customIcon: '∿', formula: '0.15α² + sin 2α', tag: 'four dips, one true bottom' }
  ],
  'Curve fitting': [
    { name: 'Linear', icon: 'trending-up', formula: 'αX + β', tag: 'one bowl, one minimum' },
    { name: 'Polynomial', customIcon: 'x²', formula: 'αX² + βX', tag: 'curvature; convex bowl' },
    { name: 'Sine', icon: 'activity', formula: 'α sin(βX)', tag: 'frequency aliasing → many minima' },
    { name: 'Exponential', icon: 'trending-down', formula: 'α e^(−βX)', tag: 'anisotropic; momentum shines' },
    { name: 'Damped Osc.', icon: 'waves', formula: 'e^(−αt) cos(βt)', tag: 'decay × ringing; symmetric ±β' },
    { name: 'Gaussian Peak', icon: 'mountain', formula: 'exp(−(X−α)²/2β²)', tag: 'vanishing gradients far out' },
    { name: 'Logistic Growth', customIcon: 'σ', formula: '1 / (1 + e^(−(αX+β)))', tag: 'sigmoid — saturates at extremes' },
    { name: 'Power Law', customIcon: 'xⁿ', formula: 'αX^β', tag: 'long, narrow valley' },
    { name: 'Mixture', customIcon: 'ΛΛ', formula: 'e^−(X−α)² + e^−(X−β)²', tag: 'two equivalent minima (α↔β)' },
  ],
  'Classification & geometry': [
    { name: 'Logistic Reg.', icon: 'percent', formula: 'σ(αX + βY)', tag: 'find the linear boundary' },
    { name: 'Circle Classifier', icon: 'target', formula: 'σ((R²−d²)/τ)', tag: 'find a circle center' },
    { name: 'Source Localization', icon: 'radio', formula: 'K / (d² + ε)', tag: 'inverse-square triangulation' },
    { name: 'Mean-Shift Cluster', icon: 'scatter-chart', formula: 'Σ(1 − kᵢ)/n', tag: 'two cluster modes' }
  ],
  'Time series': [
    { name: 'AR(2)', customIcon: 'xₜ', formula: 'αxₜ₋₁ + βxₜ₋₂', tag: 'least squares on the series’ own past' },
    { name: 'AR(2) Rollout', customIcon: 'x̂ₜ', formula: 'αx̂ₜ₋₁ + βx̂ₜ₋₂, rolled 6×', tag: 'errors compound — the stability triangle becomes a cliff' }
  ],
  'Neural network': [
    { name: 'Tiny Neural Net', icon: 'brain', formula: 'β tanh(αX)', tag: 'mirror minima; zero-init is a dead saddle' }
  ],
  'Pure surfaces (no data)': [
    { name: 'Stretched Bowl', customIcon: 'κ', formula: '0.2α² + 2β²', tag: 'exact quadratic; κ = 10, edge at γ = 0.5' },
    { name: 'Rosenbrock Valley', customIcon: '∪', formula: '(1−α)² + 100(β−α²)²', tag: 'the classic banana benchmark' },
    { name: 'Saddle Point', customIcon: '±', formula: 'α² − β² + β⁴/8 + 2', tag: 'gradients die at dead center' },
    { name: 'Himmelblau', customIcon: '∷', formula: '(α²+β−11)² + (α+β²−7)²', tag: 'four equally deep minima' }
  ]
};
