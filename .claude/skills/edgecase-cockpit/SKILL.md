---
name: edgecase-cockpit-conventions
description: Development conventions and patterns for edgecase-cockpit. TypeScript React project with conventional commits.
---

# Edgecase Cockpit Conventions

> Generated from [asherlewis-uk/edgecase-cockpit](https://github.com/asherlewis-uk/edgecase-cockpit) on 2026-09-03

## Overview

This skill teaches Claude the development patterns and conventions used in edgecase-cockpit.

## Tech Stack

- **Primary Language**: TypeScript
- **Framework**: React
- **Architecture**: type-based module organization
- **Test Location**: colocated
- **Test Framework**: vitest

## When to Use This Skill

Activate this skill when:
- Making changes to this repository
- Adding new features following established patterns
- Writing tests that match project conventions
- Creating commits with proper message format

## Commit Conventions

Follow these commit message conventions based on 37 analyzed commits.

### Commit Style: Conventional Commits

### Prefixes Used

- `fix`
- `test`
- `docs`
- `ci`
- `feat`
- `refactor`

### Message Guidelines

- Average message length: ~65 characters
- Keep first line concise and descriptive
- Use imperative mood ("Add feature" not "Added feature")


*Commit message example*

```text
style: apply prettier formatting pass
```

*Commit message example*

```text
ci: make the E2E gate assertable and lock in a coverage floor
```

*Commit message example*

```text
feat: add real verification plan and webhook tool execution documentation
```

*Commit message example*

```text
docs(plan): implementation plan for V1 account isolation and surface contract
```

*Commit message example*

```text
fix(identity): stop keying account data as guest
```

*Commit message example*

```text
docs(plan): revise for in-flight leak, SSRF, and five unread subsystems
```

*Commit message example*

```text
fix(identity): separate sync and async hydration gates
```

*Commit message example*

```text
fix(auth): default claimGuestData to false and gate sign-in on a choice
```

## Architecture

### Project Structure: Single Package

This project uses **type-based** module organization.

### Source Layout

```
src/
├── components/
├── hooks/
├── lib/
├── routes/
├── styles/
```

### Configuration Files

- `.github/workflows/ci.yml`
- `electron/tsconfig.json`
- `eslint.config.js`
- `package.json`
- `playwright.config.ts`
- `vitest.config.ts`

### Guidelines

- Group code by type (components, services, utils)
- Keep related functionality in the same type folder
- Avoid circular dependencies between type folders

## Code Style

### Language: TypeScript

### Naming Conventions

| Element | Convention |
|---------|------------|
| Files | camelCase |
| Functions | camelCase |
| Classes | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |

### Import Style: Path Aliases (@/, ~/)

### Export Style: Mixed Style


*Preferred import style*

```typescript
// Use path aliases for imports
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
```

## Testing

### Test Framework: vitest

### File Pattern: `*.test.ts`

### Test Types

- **Unit tests**: Test individual functions and components in isolation
- **Integration tests**: Test interactions between multiple components/services
- **E2e tests**: Test complete user flows through the application

### Mocking: vi.mock

### Coverage

This project has coverage reporting configured. Aim for 80%+ coverage.


*Test file structure*

```typescript
import { describe, it, expect } from 'vitest'

describe('MyFunction', () => {
  it('should return expected result', () => {
    const result = myFunction(input)
    expect(result).toBe(expected)
  })
})
```

## Error Handling

### Error Handling Style: Try-Catch Blocks


*Standard error handling pattern*

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('User-friendly message')
}
```

## Common Workflows

These workflows were detected from analyzing commit patterns.

### Feature Development

Standard feature implementation workflow

**Frequency**: ~4 times per month

**Steps**:
1. Add feature implementation
2. Add tests for feature
3. Update documentation

**Files typically involved**:
- `e2e/*`
- `/*`
- `electron/*`
- `**/*.test.*`

**Example commit sequence**:
```
ci: make the E2E gate assertable and lock in a coverage floor
feat: add real verification plan and webhook tool execution documentation
docs(plan): implementation plan for V1 account isolation and surface contract
```


## Best Practices

Based on analysis of the codebase, follow these practices:

### Do

- Use conventional commit format (feat:, fix:, etc.)
- Write tests using vitest
- Follow *.test.ts naming pattern
- Use camelCase for file names
- Prefer mixed exports

### Don't

- Don't use long relative imports (use aliases)
- Don't write vague commit messages
- Don't skip tests for new features
- Don't deviate from established patterns without discussion

---

*This skill was auto-generated by [ECC Tools](https://ecc.tools). Review and customize as needed for your team.*
