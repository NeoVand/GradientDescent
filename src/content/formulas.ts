/**
 * The named formula registry — every display formula the guide renders gets a
 * stable key here, never an anonymous inline string. The key doubles as the
 * equation label for cross-references and the LaTeX export (eq:<key>).
 */

export const formulas = {
  updateRule: String.raw`\boldsymbol{\theta}^{(t+1)} \leftarrow \boldsymbol{\theta}^{(t)} - \gamma\, \nabla \mathcal{L}(\boldsymbol{\theta}^{(t)})`,
  lossDefinition: String.raw`\mathcal{L}(\alpha,\beta) = \tfrac{1}{n}\sum_{i=1}^{n} \big(\hat{y}_i - y_i\big)^{2}`,
  gradientDefinition: String.raw`\nabla \mathcal{L} = \begin{bmatrix} \partial \mathcal{L}/\partial \alpha \\[2pt] \partial \mathcal{L}/\partial \beta \end{bmatrix}`,
  stepRule: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \nabla \mathcal{L}`,
  stability: String.raw`\gamma < \frac{2}{\lambda_{\max}}`,
  directional: String.raw`D_{\mathbf{u}}\,\mathcal{L} \;=\; \nabla \mathcal{L}\cdot\mathbf{u} \;=\; \lVert \nabla \mathcal{L}\rVert\,\cos\theta`
};
