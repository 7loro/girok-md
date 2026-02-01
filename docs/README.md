# girok-md Documentation

This folder contains the documentation website for girok-md, built with [Starlight](https://starlight.astro.build/).

## Development

```bash
cd docs
npm install
npm run dev
```

Visit http://localhost:4321/girok-md

## Build

```bash
npm run build
```

## Structure

```
docs/
├── src/
│   └── content/
│       └── docs/          # English docs (default)
│           ├── index.mdx
│           ├── quick-start.mdx
│           ├── guides/
│           ├── reference/
│           └── ko/        # Korean docs
├── public/
├── astro.config.mjs
└── package.json
```

## Deployment

Documentation is automatically deployed to GitHub Pages when changes are pushed to the `main` branch.

The deployment workflow is defined in `.github/workflows/deploy-docs.yml`.
