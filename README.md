# ∂ Gradient Descent Explorer

[![Svelte](https://img.shields.io/badge/Svelte-5.55-FF3E00?style=flat&logo=svelte&logoColor=white)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![D3.js](https://img.shields.io/badge/D3.js-7.9-F9A03C?style=flat&logo=d3.js&logoColor=white)](https://d3js.org/)
[![License](https://img.shields.io/badge/License-MIT-10b981?style=flat)](LICENSE)

An interactive visualization tool for understanding gradient descent through beautiful, real-time animations and mathematical rigor.

**[🚀 Live Demo](https://neovand.github.io/GradientDescent/)**

![Gradient Descent Explorer](public/screenshot.gif)

## ✨ Features

- **Interactive Loss Landscape**: Color-coded heatmap, smooth contour lines, and gradient vector field all in one view
- **Real-time Training**: Watch gradient descent optimize with animated parameter trails that fade over time
- **Multiple Problem Types**: Explore linear regression, logistic classification, and polynomial regression
- **Beautiful LaTeX Formulas**: Professional mathematical notation rendered with KaTeX
- **Dark/Light Themes**: Elegant emerald-themed interface with seamless theme switching
- **Educational**: Comprehensive help modal with theory and suggested experiments

## 🎯 What It Does

Gradient Descent Explorer helps you understand optimization algorithms through visual experimentation:

- **Drag** the orange marker to manually explore parameter space
- **Train** the model to watch gradient descent find optimal solutions automatically
- **Experiment** with learning rates, noise levels, and data splits
- **Observe** how loss landscapes change with different configurations

> **💡 Tip**: Drag the orange marker on the Loss & Gradient diagram to explore the connection between parameters, the model, and loss in real-time.

## 🚀 Quick Start

### Prerequisites

- Node.js 20 or higher
- npm

### Local Development

```bash
# Clone the repository
git clone https://github.com/neovand/GradientDescent.git
cd GradientDescent

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## 🛠️ Built With

- **[Svelte 5](https://svelte.dev/)** - Reactive UI framework
- **[D3.js](https://d3js.org/)** - Data visualization and SVG rendering
- **[KaTeX](https://katex.org/)** - Fast LaTeX math rendering
- **[Lucide Icons](https://lucide.dev/)** - Beautiful icon library
- **[Vite](https://vitejs.dev/)** - Lightning-fast build tool

## 📐 Mathematical Foundation

The app visualizes the gradient descent update rule:

**θ** ← **θ** - γ∇ℒ

where **θ** = [α, β]ᵀ are the parameters, γ is the learning rate, and ∇ℒ is the gradient of the loss function.

## 🎨 Key Visualizations

- **Data Plot**: Training and test data with model predictions and decision boundaries (for classification)
- **Loss & Gradient**: Color-coded loss heatmap with iso-loss contour lines and gradient vector field
- **Loss History**: Training dynamics with sliding window display (last 500 steps) and current position markers
- **Formulas**: Real-time LaTeX-rendered equations showing model, parameters, loss, and update rules

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 👨‍💻 Author

**Neo Mohsenvand**

Developed with ∂ for educational purposes

---

## ⭐ Show Your Support

If you find this project helpful for learning or teaching gradient descent, please consider giving it a star! Your support helps make educational tools like this more visible to students and educators worldwide.

[![Star History](https://img.shields.io/github/stars/neovand/GradientDescent?style=social)](https://github.com/neovand/GradientDescent/stargazers)

---

*Explore, experiment, and understand gradient descent like never before.*
