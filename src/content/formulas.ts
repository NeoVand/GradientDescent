/**
 * The named formula registry — every display formula the guide renders gets a
 * stable key here, never an anonymous inline string. The key doubles as the
 * equation label for cross-references and the LaTeX export (eq:<key>).
 */

export const formulas = {
  updateRule: String.raw`\boldsymbol{\theta}^{(t+1)} \leftarrow \boldsymbol{\theta}^{(t)} - \gamma\, \nabla \mathcal{L}(\boldsymbol{\theta}^{(t)})`,
  lossDefinition: String.raw`\mathcal{L}(\alpha,\beta) = \tfrac{1}{n}\sum_{i=1}^{n} \big(\hat{y}_i - y_i\big)^{2}`,
  crossEntropy: String.raw`\mathcal{L} = -\big[\,y\,\log \hat{y} + (1-y)\,\log(1-\hat{y})\,\big]`,
  gradientDefinition: String.raw`\nabla \mathcal{L} = \begin{bmatrix} \partial \mathcal{L}/\partial \alpha \\[2pt] \partial \mathcal{L}/\partial \beta \end{bmatrix}`,
  stepRule: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \nabla \mathcal{L}`,
  stability: String.raw`\gamma < \frac{2}{\lambda_{\max}}`,
  // The derivative chapter: nudge-and-divide, then let the nudge shrink.
  derivativeLimit: String.raw`\frac{d\mathcal{L}}{d\alpha} \;=\; \lim_{h \to 0}\; \frac{\mathcal{L}(\alpha + h) - \mathcal{L}(\alpha)}{h}`,
  partialDef: String.raw`\frac{\partial \mathcal{L}}{\partial \alpha} \;=\; \lim_{h \to 0}\; \frac{\mathcal{L}(\alpha + h,\; \beta) - \mathcal{L}(\alpha,\; \beta)}{h}`,
  // The curvature chapter: the one-line mechanism behind the 2/λmax edge,
  // the 2×2 table of bendings, and the ravine number.
  contraction: String.raw`\alpha \;\leftarrow\; \alpha - \gamma\,\lambda\alpha \;=\; (1 - \gamma\lambda)\,\alpha`,
  hessianMatrix: String.raw`\mathbf{H} \;=\; \begin{bmatrix} \dfrac{\partial^2 \mathcal{L}}{\partial \alpha^2} & \dfrac{\partial^2 \mathcal{L}}{\partial \alpha\,\partial \beta} \\[10pt] \dfrac{\partial^2 \mathcal{L}}{\partial \alpha\,\partial \beta} & \dfrac{\partial^2 \mathcal{L}}{\partial \beta^2} \end{bmatrix}`,
  kappa: String.raw`\kappa \;=\; \frac{\lambda_{\max}}{\lambda_{\min}}`,
  // φ, not θ: the proof's angle must not collide with θ = the parameter pair,
  // which the very next chapter introduces and the rest of the book keeps.
  directional: String.raw`D_{\mathbf{u}}\,\mathcal{L} \;=\; \nabla \mathcal{L}\cdot\mathbf{u} \;=\; \lVert \nabla \mathcal{L}\rVert\,\cos\varphi`
};
