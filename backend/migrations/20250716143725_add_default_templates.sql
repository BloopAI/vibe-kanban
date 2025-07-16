-- Add default global templates

-- 1. Bug Analysis template
INSERT INTO task_templates (
    id,
    project_id,
    title,
    description,
    template_name,
    created_at,
    updated_at
) VALUES (
    randomblob(16),
    NULL, -- Global template
    'Analyze codebase for potential bugs and issues',
    'Perform a comprehensive analysis of the project codebase to identify potential bugs, code smells, and areas of improvement.

## Analysis Checklist:

### 1. Static Code Analysis
- [ ] Run linting tools to identify syntax and style issues
- [ ] Check for unused variables, imports, and dead code
- [ ] Identify potential type errors or mismatches
- [ ] Look for deprecated API usage

### 2. Common Bug Patterns
- [ ] Check for null/undefined reference errors
- [ ] Identify potential race conditions
- [ ] Look for improper error handling
- [ ] Check for resource leaks (memory, file handles, connections)
- [ ] Identify potential security vulnerabilities (XSS, SQL injection, etc.)

### 3. Code Quality Issues
- [ ] Identify overly complex functions (high cyclomatic complexity)
- [ ] Look for code duplication
- [ ] Check for missing or inadequate input validation
- [ ] Identify hardcoded values that should be configurable

### 4. Testing Gaps
- [ ] Identify untested code paths
- [ ] Check for missing edge case tests
- [ ] Look for inadequate error scenario testing

### 5. Performance Concerns
- [ ] Identify potential performance bottlenecks
- [ ] Check for inefficient algorithms or data structures
- [ ] Look for unnecessary database queries or API calls

## Deliverables:
1. Prioritized list of identified issues
2. Recommendations for fixes
3. Estimated effort for addressing each issue',
    'Bug Analysis',
    datetime('now', 'subsec'),
    datetime('now', 'subsec')
);

-- 2. Unit Test template
INSERT INTO task_templates (
    id,
    project_id,
    title,
    description,
    template_name,
    created_at,
    updated_at
) VALUES (
    randomblob(16),
    NULL, -- Global template
    'Add unit tests for [component/function]',
    'Write unit tests to improve code coverage and ensure reliability.

## Unit Testing Checklist

### 1. Identify What to Test
- [ ] Run coverage report to find untested functions
- [ ] List the specific functions/methods to test
- [ ] Note current coverage percentage

### 2. Write Tests
- [ ] Test the happy path (expected behavior)
- [ ] Test edge cases (empty inputs, boundaries)
- [ ] Test error cases (invalid inputs, exceptions)
- [ ] Mock external dependencies
- [ ] Use descriptive test names

### 3. Test Quality
- [ ] Each test focuses on one behavior
- [ ] Tests can run independently
- [ ] No hardcoded values that might change
- [ ] Clear assertions that verify the behavior

## Examples to Cover:
- Normal inputs → Expected outputs
- Empty/null inputs → Proper handling
- Invalid inputs → Error cases
- Boundary values → Edge case behavior

## Goal
Achieve at least 80% coverage for the target component

## Deliverables
1. New test file(s) with comprehensive unit tests
2. Updated coverage report
3. All tests passing',
    'Add Unit Tests',
    datetime('now', 'subsec'),
    datetime('now', 'subsec')
);

-- 3. Code Refactoring template
INSERT INTO task_templates (
    id,
    project_id,
    title,
    description,
    template_name,
    created_at,
    updated_at
) VALUES (
    randomblob(16),
    NULL, -- Global template
    'Refactor [component/module] for better maintainability',
    'Improve code structure and maintainability without changing functionality.

## Refactoring Checklist

### 1. Identify Refactoring Targets
- [ ] Run code analysis tools (linters, complexity analyzers)
- [ ] Identify code smells (long methods, duplicate code, large classes)
- [ ] Check for outdated patterns or deprecated approaches
- [ ] Review areas with frequent bugs or changes

### 2. Plan the Refactoring
- [ ] Define clear goals (what to improve and why)
- [ ] Ensure tests exist for current functionality
- [ ] Create a backup branch
- [ ] Break down into small, safe steps

### 3. Common Refactoring Actions
- [ ] Extract methods from long functions
- [ ] Remove duplicate code (DRY principle)
- [ ] Rename variables/functions for clarity
- [ ] Simplify complex conditionals
- [ ] Extract constants from magic numbers/strings
- [ ] Group related functionality into modules
- [ ] Remove dead code

### 4. Maintain Functionality
- [ ] Run tests after each change
- [ ] Keep changes small and incremental
- [ ] Commit frequently with clear messages
- [ ] Verify no behavior has changed

### 5. Code Quality Improvements
- [ ] Apply consistent formatting
- [ ] Update to modern syntax/features
- [ ] Improve error handling
- [ ] Add type annotations (if applicable)

## Success Criteria
- All tests still pass
- Code is more readable and maintainable
- No new bugs introduced
- Performance not degraded

## Deliverables
1. Refactored code with improved structure
2. All tests passing
3. Brief summary of changes made',
    'Code Refactoring',
    datetime('now', 'subsec'),
    datetime('now', 'subsec')
);