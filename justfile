# girok-md task runner — run `just` to list recipes

# List available recipes
default:
    @just --list

# Start dev server (localhost:4321)
dev:
    npm run dev

# Production build (postbuild runs pagefind indexing)
build:
    npm run build

# Preview production build
preview:
    npm run preview

# Sync markdown from source_root_path in setting.toml
sync:
    npm run sync

# Auto-translate posts
translate:
    npm run translate

# Remove generated files
clean:
    npm run clean

# Build and run the web dashboard (http://127.0.0.1:4322)
dashboard:
    npm run dashboard

# Dashboard API server only (assumes UI already built)
dashboard-server:
    npm run dashboard:server

# Dashboard web UI with HMR (localhost:4323, needs dashboard-server running)
dashboard-web:
    npm run dashboard:dev

# Run tests once; pass vitest args through (e.g. `just test sync`)
test *ARGS:
    npx vitest run {{ARGS}}

# Tests in watch mode
test-watch:
    npx vitest

# Typecheck root, dashboard server, and dashboard web
typecheck:
    npm run typecheck
