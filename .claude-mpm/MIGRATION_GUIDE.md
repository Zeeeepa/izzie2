# Configuration Migration Guide

Guide for understanding and adapting to the optimized Claude MPM configuration.

## Overview

**Migration Date**: 2025-01-05
**Type**: Skills optimization (130+ → 40 skills)
**Impact**: Low (removed irrelevant skills only)
**Breaking Changes**: None

## What Changed

### 1. Skills List Reduced by 70%

**Before**: 130+ skills loaded on every project start
**After**: 40 highly relevant skills for this project

### 2. Agent Preferences Added

**New section** in configuration.yaml:
```yaml
agent_preferences:
  primary_engineer: typescript-engineer
  primary_qa: api-qa
  primary_ops: vercel-ops
  ai_specialist: openrouter-engineer
  event_specialist: nodejs-backend
```

### 3. Documentation Created

**New files**:
- `.claude-mpm/project-skills.md` - What each skill does
- `.claude-mpm/OPTIMIZATION_SUMMARY.md` - What changed
- `.claude-mpm/SKILLS_QUICK_REFERENCE.md` - Quick lookup guide
- `.claude-mpm/MIGRATION_GUIDE.md` - This file

## Skills Mapping

If you were using any removed skills, here are the alternatives:

### Python Web Frameworks → Not Needed

**Removed**: Django, Flask, FastAPI, SQLAlchemy, Celery, pytest, mypy, pyright

**Why**: Izzie2 is a TypeScript/Next.js project, not Python

**If you need Python**: Add back specific skills:
```bash
claude-mpm skills add django
claude-mpm skills add pytest
```

### Frontend Frameworks → Using Next.js/React

**Removed**: Vue, Svelte, SvelteKit, Svelte5, Solid.js, Qwik

**Why**: Project uses Next.js 16 + React 19

**Replaced by**:
- `nextjs`, `nextjs-core`, `nextjs-v16`
- `react`

### Database ORMs → Using Direct Drivers

**Removed**: Drizzle, Prisma, Kysely, Supabase

**Why**: Using Neo4j driver directly, Neon Postgres client

**Replaced by**:
- Neo4j driver documentation
- Direct SQL when needed
- `zod` for validation

### UI Libraries → Not Using Component Libraries Yet

**Removed**: DaisyUI, shadcn-ui, Headless UI, TailwindCSS

**Why**: Not in package.json, using custom components

**If you add Tailwind**:
```bash
npm install tailwindcss
claude-mpm skills add tailwind
```

### State Management → Not Needed Yet

**Removed**: Zustand, TanStack Query, tRPC

**Why**: Using React 19 built-in state, Server Components

**If you need**:
```bash
npm install zustand
claude-mpm skills add zustand
```

### Platform Tools → Using Vercel

**Removed**: DigitalOcean (6 skills), Netlify, Railway, Heroku

**Why**: Deployed on Vercel

**Replaced by**: `vercel-overview`

### Other Tools

| Removed | Why | Alternative |
|---------|-----|-------------|
| Vite | Using Turbopack | `nextjs-v16` |
| Jest | Using Vitest | `vitest` |
| ESLint | Using Biome | `biome` |
| WordPress | Not used | N/A |
| Tauri | Not desktop app | N/A |
| Golang tools | Not using Go | N/A |
| Phoenix/Ecto | Not using Elixir | N/A |

## Verification Steps

### 1. Validate Configuration

```bash
cd /Users/masa/Projects/izzie2
claude-mpm config validate
```

Expected output:
```
✓ Configuration valid
✓ 40 skills loaded
✓ Agent preferences configured
```

### 2. Check Skills

```bash
claude-mpm skills list
```

Should show 40 skills, all relevant to the project.

### 3. Test Agent Selection

```bash
claude-mpm agents list
```

Should show agents with preferences applied.

### 4. Verify Project Detection

```bash
claude-mpm project detect
```

Should detect:
- Next.js 16
- React 19
- TypeScript 5.9
- Vitest 4.0

## Troubleshooting

### "Missing skill X"

**Problem**: Code references a skill that was removed

**Solution**:
```bash
# Add back the specific skill
claude-mpm skills add <skill-name>

# Or update code to use alternative skill
```

### "Agent preference not found"

**Problem**: Custom agent referenced in preferences doesn't exist

**Solution**:
```bash
# List available agents
claude-mpm agents list

# Update agent_preferences in configuration.yaml
vim .claude-mpm/configuration.yaml
```

### "Skills loading slowly"

**Problem**: Still loading many skills

**Solution**:
```bash
# Clear cache
claude-mpm cache clear

# Reload configuration
claude-mpm config reload
```

### "Tests failing"

**Problem**: Tests reference removed skill

**Solution**:
1. Check which skill is missing
2. Either add skill back or update test
3. See `project-skills.md` for skill mappings

## Rollback Procedure

If you need to revert to the old configuration:

```bash
# 1. Backup current optimized version
cp .claude-mpm/configuration.yaml .claude-mpm/configuration.yaml.optimized

# 2. Restore from git
git checkout HEAD -- .claude-mpm/configuration.yaml

# 3. Reload configuration
claude-mpm config reload

# 4. Verify
claude-mpm config validate
```

## Future Updates

### Adding Skills

When you add new dependencies:

```bash
# Example: Adding Prisma
npm install prisma
claude-mpm skills add prisma-orm

# Document why
echo "- prisma-orm: PostgreSQL ORM" >> .claude-mpm/project-skills.md
```

### Removing Skills

When you remove dependencies:

```bash
# Example: Removing Vitest
npm uninstall vitest

# Remove from configuration
vim .claude-mpm/configuration.yaml
# Delete 'vitest' from skills list

# Document removal
echo "Removed vitest (switched to Jest)" >> .claude-mpm/OPTIMIZATION_SUMMARY.md
```

### Quarterly Review

Every 3 months:

1. **Audit package.json**
   ```bash
   npm list --depth=0
   ```

2. **Check active skills**
   ```bash
   claude-mpm skills list --active
   ```

3. **Remove unused**
   - Compare package.json to skills
   - Remove skills for removed deps

4. **Add missing**
   - Check new dependencies
   - Add relevant skills

5. **Update documentation**
   - Update `project-skills.md`
   - Update this guide

## Performance Impact

### Before Optimization

- **Skills loaded**: 130+
- **Context window**: Large overhead
- **Load time**: Slower
- **Memory**: Higher usage
- **Irrelevant suggestions**: Common

### After Optimization

- **Skills loaded**: 40
- **Context window**: Efficient
- **Load time**: Faster
- **Memory**: Lower usage
- **Irrelevant suggestions**: Eliminated

## Success Metrics

After migration, you should see:

- Faster Claude MPM startup
- More relevant skill suggestions
- Clearer agent selection
- Better documentation
- Easier maintenance

## Questions?

If something isn't working:

1. Check this guide
2. Review `project-skills.md`
3. Validate configuration: `claude-mpm config validate`
4. Check logs: `~/.claude-mpm/logs/`
5. Ask in Claude conversation

## Resources

- `project-skills.md` - What each skill does
- `OPTIMIZATION_SUMMARY.md` - What changed
- `SKILLS_QUICK_REFERENCE.md` - Quick lookup
- `configuration.yaml` - Full config (with comments)

---

**Migration Status**: Complete
**Risk Level**: Low
**Rollback Available**: Yes
**Testing**: Configuration validated
