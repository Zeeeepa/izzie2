# KuzuMemory PM-Level Integration Architecture

**Research Date**: 2026-02-01
**Status**: Design Complete
**Work Type**: Actionable (Implementation Required)

## Executive Summary

This document presents the integration architecture for embedding kuzu-memory as a core dependency in claude-mpm to capture PM-level orchestration patterns. The goal is to enrich future conversations with context about user directives, preferences, workflow patterns, and cross-project decisions.

## Research Findings

### 1. KuzuMemory Python API

The kuzu-memory library provides a comprehensive Python API through the `KuzuMemory` class:

**Primary Methods:**

| Method | Purpose | Performance Target |
|--------|---------|-------------------|
| `attach_memories(prompt, ...)` | Retrieve relevant memories for a prompt | <10ms |
| `generate_memories(content, ...)` | Extract and store memories from content | <20ms |
| `remember(content, ...)` | Store a single memory immediately (sync) | N/A |

**Key API Signatures:**

```python
from kuzu_memory import KuzuMemory, Memory, MemoryType

# Initialize
km = KuzuMemory(
    db_path=Path("~/.kuzu-memory/memories.db"),
    enable_git_sync=True,
    auto_sync=False  # Disable for hooks (faster startup)
)

# Enhance prompt with memories
context = km.attach_memories(
    prompt="user's message",
    max_memories=5,
    strategy="auto",  # auto|keyword|entity|temporal
    user_id="git-user-id",
    session_id="claude-session-id",
    agent_id="pm"  # Use "pm" for PM-level memories
)
# Returns: MemoryContext with enhanced_prompt, memories, confidence

# Store explicit memory (synchronous)
memory_id = km.remember(
    content="User prefers PR workflow for izzie project",
    source="pm-directive",
    session_id="session-123",
    agent_id="pm",
    metadata={"project": "izzie", "type": "preference"}
)

# Extract patterns from content (asynchronous-friendly)
memory_ids = km.generate_memories(
    content="conversation transcript",
    source="pm-orchestration",
    user_id="git-user-id",
    session_id="session-123",
    agent_id="pm",
    metadata={"context": "delegation"}
)
```

### 2. Memory Types for PM Context

Based on kuzu-memory's `MemoryType` enum, the following categorization is recommended for PM-level memories:

| Category | MemoryType | Retention | Use Case |
|----------|------------|-----------|----------|
| User Directives | EPISODIC | 30 days | "implement feature X", "work on @project" |
| Project Preferences | PREFERENCE | Never expires | "always use PR model for izzie" |
| Workflow Patterns | PROCEDURAL | Never expires | "when deploying, always run tests first" |
| Architectural Decisions | SEMANTIC | Never expires | Design choices made during orchestration |
| Cross-Project Context | SEMANTIC | Never expires | Relationships between projects |
| Session Context | WORKING | 1 day | Current session state, temporary context |

### 3. Existing claude-mpm Integration Points

The research identified three key integration points in claude-mpm:

#### a) Event Handlers (`event_handlers.py`)

**Current State:** Has `handle_user_prompt_fast()` that captures user prompts but doesn't integrate with PM memory.

**Integration Point:**
```python
# In EventHandlers class
def handle_user_prompt_fast(self, event):
    prompt = event.get("prompt", "")
    session_id = event.get("session_id", "")

    # NEW: Enhance prompt with PM memory
    if self.pm_memory_manager:
        enhanced = self.pm_memory_manager.enhance_with_pm_context(prompt, session_id)
        # Inject enhanced context back into event
```

#### b) Memory Integration (`memory_integration.py`)

**Current State:** Has `MemoryHookManager` for agent-level memory injection/extraction during Task delegations.

**Gap:** No PM-level memory layer exists. Current implementation focuses on:
- Pre-delegation: Injecting agent memory into task prompt
- Post-delegation: Extracting learnings from agent results

**New Layer Needed:** PM-level memory that operates at the orchestration level, not agent level.

#### c) Hook Handler (`hook_handler.py`)

**Current State:** Main handler with service-oriented architecture and dependency injection support.

**Integration Point:** Register PM memory manager as a service in `HookServiceContainer`.

### 4. Architectural Design

```
+-------------------+     +----------------------+
|   Claude Code     |     |    kuzu-memory       |
|   (User Input)    |     |    (KuzuMemory)      |
+--------+----------+     +----------+-----------+
         |                           |
         v                           |
+--------+----------+                |
|   PM Hook Layer   |                |
| (event_handlers)  |<---------------+
+--------+----------+     PM Memory Manager
         |                (NEW COMPONENT)
         v
+--------+----------+
|   Agent Memory    |
| (memory_integration)
+-------------------+
         |
         v
+-------------------+
|   Agent Tasks     |
| (Task delegations)|
+-------------------+
```

## Implementation Architecture

### Component 1: PMMemoryManager (New)

**File:** `claude_mpm/hooks/claude_hooks/pm_memory_manager.py`

```python
"""PM-level memory manager for orchestration context."""

from pathlib import Path
from typing import Any, Optional
from kuzu_memory import KuzuMemory, MemoryType

class PMMemoryManager:
    """Manages PM-level memory for user directives, preferences, and patterns."""

    PM_AGENT_ID = "pm"  # Distinguish from agent-level memories

    def __init__(self, config: dict):
        self.config = config
        self.memory: Optional[KuzuMemory] = None
        self._initialize()

    def _initialize(self):
        """Initialize kuzu-memory connection."""
        db_path = Path.home() / ".kuzu-memory" / "memories.db"
        self.memory = KuzuMemory(
            db_path=db_path,
            enable_git_sync=False,  # PM layer doesn't need git sync
            auto_sync=False,        # Faster hook startup
        )

    def enhance_prompt_with_pm_context(
        self,
        prompt: str,
        session_id: str,
        project: Optional[str] = None
    ) -> str:
        """Enhance user prompt with PM-level memories.

        Called on UserPromptSubmit to inject relevant orchestration context.
        """
        if not self.memory:
            return prompt

        context = self.memory.attach_memories(
            prompt=prompt,
            max_memories=5,
            strategy="auto",
            session_id=session_id,
            agent_id=self.PM_AGENT_ID,
        )

        if context.memories:
            return context.enhanced_prompt
        return prompt

    def capture_user_directive(
        self,
        directive: str,
        session_id: str,
        project: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> str:
        """Capture explicit user directive as PM memory.

        Called when user provides explicit instructions.
        """
        if not self.memory:
            return ""

        return self.memory.remember(
            content=directive,
            source="pm-user-directive",
            session_id=session_id,
            agent_id=self.PM_AGENT_ID,
            metadata={
                "project": project,
                "type": "directive",
                **(metadata or {})
            }
        )

    def capture_preference(
        self,
        preference: str,
        project: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> str:
        """Capture user preference for future sessions.

        Called when user expresses a preference.
        """
        if not self.memory:
            return ""

        return self.memory.remember(
            content=preference,
            source="pm-preference",
            agent_id=self.PM_AGENT_ID,
            metadata={
                "project": project,
                "type": "preference",
                "memory_type": MemoryType.PREFERENCE.value,
                **(metadata or {})
            }
        )

    def capture_workflow_pattern(
        self,
        pattern: str,
        project: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> str:
        """Capture workflow pattern for procedural memory.

        Called when user establishes a workflow.
        """
        if not self.memory:
            return ""

        return self.memory.remember(
            content=pattern,
            source="pm-workflow",
            agent_id=self.PM_AGENT_ID,
            metadata={
                "project": project,
                "type": "workflow",
                "memory_type": MemoryType.PROCEDURAL.value,
                **(metadata or {})
            }
        )

    def capture_delegation_outcome(
        self,
        agent_type: str,
        task_summary: str,
        outcome: str,
        session_id: str,
        project: Optional[str] = None
    ) -> list[str]:
        """Capture delegation patterns from orchestration.

        Called after agent task completion to learn patterns.
        """
        if not self.memory:
            return []

        content = f"Delegated to {agent_type}: {task_summary}\nOutcome: {outcome}"

        return self.memory.generate_memories(
            content=content,
            source="pm-delegation",
            session_id=session_id,
            agent_id=self.PM_AGENT_ID,
            metadata={
                "project": project,
                "agent_type": agent_type,
                "type": "delegation_pattern"
            }
        )
```

### Component 2: Event Handler Integration

**File:** `claude_mpm/hooks/claude_hooks/event_handlers.py` (modifications)

```python
# Add to imports
from claude_mpm.hooks.claude_hooks.pm_memory_manager import PMMemoryManager

# In EventHandlers.__init__
def __init__(self, hook_handler, container=None):
    # ... existing code ...

    # NEW: Initialize PM memory manager
    self.pm_memory_manager: Optional[PMMemoryManager] = None
    if MEMORY_HOOKS_AVAILABLE:
        try:
            config = container.get_config() if container else {}
            if config.get("pm_memory.enabled", True):
                self.pm_memory_manager = PMMemoryManager(config)
        except Exception as e:
            if DEBUG:
                _log(f"PM memory manager init failed: {e}")

# In handle_user_prompt_fast
def handle_user_prompt_fast(self, event):
    prompt = event.get("prompt", "")
    session_id = event.get("session_id", "")

    # NEW: Enhance prompt with PM context
    if self.pm_memory_manager:
        try:
            enhanced_prompt = self.pm_memory_manager.enhance_prompt_with_pm_context(
                prompt=prompt,
                session_id=session_id,
                project=self._detect_project(event)
            )
            # Note: Cannot modify event in UserPromptSubmit (read-only)
            # This enhancement needs to be available to PM via MCP
        except Exception as e:
            if DEBUG:
                _log(f"PM context enhancement failed: {e}")

    # ... rest of existing handler ...

    # NEW: Detect and capture directives/preferences
    self._capture_pm_patterns(prompt, session_id, event)

def _capture_pm_patterns(self, prompt: str, session_id: str, event: dict):
    """Extract and capture PM-level patterns from user input."""
    if not self.pm_memory_manager:
        return

    project = self._detect_project(event)

    # Pattern: Explicit preferences ("always", "prefer", "never")
    preference_patterns = ["always", "prefer", "never", "want to"]
    if any(p in prompt.lower() for p in preference_patterns):
        self.pm_memory_manager.capture_preference(
            preference=prompt,
            project=project
        )

    # Pattern: Workflow definitions ("when X, do Y")
    workflow_patterns = ["when ", "before ", "after ", "first "]
    if any(p in prompt.lower() for p in workflow_patterns):
        self.pm_memory_manager.capture_workflow_pattern(
            pattern=prompt,
            project=project
        )
```

### Component 3: Post-Delegation Learning

**File:** `claude_mpm/hooks/claude_hooks/event_handlers.py` (additions to delegation handling)

```python
# In _handle_task_completion (new method or existing PostToolUse handler)
def _capture_delegation_learning(
    self,
    agent_type: str,
    task_input: dict,
    result: dict,
    session_id: str,
    event: dict
):
    """Capture learnings from agent delegation outcomes."""
    if not self.pm_memory_manager:
        return

    task_summary = task_input.get("prompt", "")[:200]  # Truncate for summary
    outcome = "success" if result.get("exit_code", 0) == 0 else "failed"

    self.pm_memory_manager.capture_delegation_outcome(
        agent_type=agent_type,
        task_summary=task_summary,
        outcome=outcome,
        session_id=session_id,
        project=self._detect_project(event)
    )
```

### Dependency Configuration

**File:** `pyproject.toml` (claude-mpm)

```toml
[project]
dependencies = [
    # ... existing deps ...
    "kuzu-memory>=0.1.0",  # PM-level memory
]

[project.optional-dependencies]
memory = [
    "kuzu-memory[full]>=0.1.0",  # Full features including embeddings
]
```

## Integration Points Summary

| Integration Point | File | Hook/Method | PM Memory Action |
|-------------------|------|-------------|------------------|
| User Prompt | event_handlers.py | handle_user_prompt_fast | enhance_prompt_with_pm_context, capture patterns |
| Pre-Delegation | memory_integration.py | trigger_pre_delegation_hook | (existing agent memory) |
| Post-Delegation | event_handlers.py | PostToolUse (Task) | capture_delegation_outcome |
| Session End | event_handlers.py | handle_stop_fast | (optional) session summary |

## What to Capture (PM-Level)

| Category | Detection Pattern | Storage Method |
|----------|-------------------|----------------|
| User Directives | Any user prompt | capture_user_directive |
| Project Preferences | "always", "prefer", "never" | capture_preference |
| Workflow Patterns | "when X do Y", "before", "after" | capture_workflow_pattern |
| Delegation Patterns | Task completion events | capture_delegation_outcome |
| Cross-Project Context | @project mentions | capture_user_directive with project tag |

## What NOT to Capture (PM-Level)

- Code-level details (agent sessions handle that)
- File contents
- Implementation specifics
- Agent-internal decisions
- Error stack traces

## Configuration Schema

```yaml
# claude_mpm.yml
pm_memory:
  enabled: true

  # Capture settings
  capture:
    user_directives: true
    preferences: true
    workflow_patterns: true
    delegation_outcomes: true

  # Enhancement settings
  enhance:
    max_memories: 5
    strategy: "auto"  # auto|keyword|entity|temporal

  # Pattern detection
  patterns:
    preference_keywords: ["always", "prefer", "never", "want"]
    workflow_keywords: ["when", "before", "after", "first", "then"]
```

## Implementation Roadmap

### Phase 1: Core Integration
1. Add kuzu-memory as dependency in pyproject.toml
2. Create PMMemoryManager class
3. Integrate with handle_user_prompt_fast

### Phase 2: Pattern Capture
4. Implement preference detection
5. Implement workflow pattern detection
6. Add delegation outcome capture

### Phase 3: Enhancement
7. Implement prompt enhancement with PM context
8. Add cross-project context handling
9. Configuration and tuning

### Phase 4: Testing
10. Unit tests for PMMemoryManager
11. Integration tests with hook handlers
12. Performance benchmarks (<10ms enhancement, <20ms capture)

## Files to Modify

| File | Action | Priority |
|------|--------|----------|
| `pyproject.toml` | Add kuzu-memory dependency | P0 |
| `pm_memory_manager.py` | Create new file | P0 |
| `event_handlers.py` | Add PM memory integration | P0 |
| `hook_handler.py` | Register PM memory service | P1 |
| `memory_integration.py` | Coordinate with PM layer | P1 |
| `claude_mpm.yml` | Add pm_memory config section | P2 |

## API Calls Summary

| Use Case | kuzu-memory API | Parameters |
|----------|-----------------|------------|
| Enhance prompt | `km.attach_memories()` | prompt, session_id, agent_id="pm" |
| Store directive | `km.remember()` | content, source="pm-directive" |
| Store preference | `km.remember()` | content, source="pm-preference" |
| Store workflow | `km.remember()` | content, source="pm-workflow" |
| Learn from delegation | `km.generate_memories()` | content, source="pm-delegation" |

## Conclusion

This architecture enables claude-mpm to maintain PM-level context across sessions by:
1. Enhancing user prompts with relevant orchestration history
2. Capturing user directives, preferences, and workflow patterns
3. Learning from delegation outcomes to improve future orchestration
4. Maintaining separation between PM-level and agent-level memories

The integration is designed to be non-blocking, with graceful degradation if kuzu-memory is unavailable.
