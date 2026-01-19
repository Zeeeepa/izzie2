# mcp-vector-search Disk Usage Fix

## Issue Summary

mcp-vector-search was consuming excessive disk space (18GB across projects) by indexing files that should have been excluded via .gitignore.

## Root Cause

Several projects had missing configuration settings:
- `respect_gitignore: false` (or not set) - did not respect .gitignore patterns
- `skip_dotfiles: false` (or not set) - indexed .next/, node_modules/, etc.
- `.json` files included - indexed large JSON files unnecessarily

## What Was Taking Up Space

| Project | Size Before | Issue |
|---------|-------------|-------|
| claude-mpm | 8.8GB | No gitignore respect |
| epstein | 5.2GB | Large dataset indexed |
| aipowerranking | 1.8GB | No gitignore respect |
| gitflow-analytics | 1.1GB | No gitignore respect |

**Total before cleanup:** 18GB
**Total after cleanup:** 1.1GB
**Space freed:** ~17GB

## Fix Applied

### 1. Updated Configuration for All Projects

```bash
# For each misconfigured project:
mcp-vector-search config set respect_gitignore true -p /path/to/project
mcp-vector-search config set skip_dotfiles true -p /path/to/project
```

### 2. Updated File Extensions (izzie2)

```bash
mcp-vector-search config set file_extensions ".ts,.tsx,.md,.js,.jsx,.py" -p /Users/masa/Projects/izzie2
```

Removed `.json` to avoid indexing large JSON files (package-lock.json, etc.).

### 3. Deleted Oversized Indexes

```bash
rm -rf /Users/masa/Projects/claude-mpm/.mcp-vector-search
rm -rf /Users/masa/Projects/aipowerranking/.mcp-vector-search
rm -rf /Users/masa/Projects/gitflow-analytics/.mcp-vector-search
rm -rf /Users/masa/Projects/epstein/.mcp-vector-search
```

## Commands to Re-index Properly

For any project that needs reindexing:

```bash
# Navigate to project
cd /path/to/project

# Initialize with proper settings
mcp-vector-search init --extensions ".ts,.tsx,.js,.jsx,.py,.md" --no-auto-index

# Verify config is correct
mcp-vector-search config show

# Ensure these are set:
# - respect_gitignore: True
# - skip_dotfiles: True

# If not, set them:
mcp-vector-search config set respect_gitignore true
mcp-vector-search config set skip_dotfiles true

# Then index
mcp-vector-search index
```

## Correct Configuration Template

The ideal config.json should look like:

```json
{
  "project_root": "/path/to/project",
  "index_path": "/path/to/project/.mcp-vector-search",
  "file_extensions": [".ts", ".tsx", ".js", ".jsx", ".py", ".md"],
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "similarity_threshold": 0.5,
  "max_chunk_size": 512,
  "watch_files": false,
  "cache_embeddings": true,
  "max_cache_size": 1000,
  "auto_reindex_on_upgrade": true,
  "skip_dotfiles": true,
  "respect_gitignore": true
}
```

**Key settings:**
- `respect_gitignore: true` - Essential to avoid indexing node_modules, .next, etc.
- `skip_dotfiles: true` - Skip hidden directories like .git, .next, etc.
- `file_extensions` - Only index code and docs, not .json, .txt, .log, etc.

## Recommended .gitignore Entries

Add to your project's .gitignore:

```gitignore
# MCP Vector Search index directory
.mcp-vector-search/
```

## Monitoring Disk Usage

Check total index sizes:

```bash
du -sh /Users/masa/Projects/*/.mcp-vector-search 2>/dev/null | sort -h
```

Check total:

```bash
du -ch /Users/masa/Projects/*/.mcp-vector-search 2>/dev/null | tail -1
```

## Security Note

**IMPORTANT**: The config.json files were found to contain API keys:
- `openrouter_api_key`
- `openai_api_key`

These should be:
1. Rotated immediately if exposed
2. Stored in environment variables instead
3. The .mcp-vector-search/ directory should always be in .gitignore

## Prevention

For new projects, always run:

```bash
mcp-vector-search setup  # Uses smart defaults including gitignore respect
```

Or initialize manually with:

```bash
mcp-vector-search init --extensions ".ts,.tsx,.js,.jsx,.py,.md"
mcp-vector-search config set respect_gitignore true
mcp-vector-search config set skip_dotfiles true
```
