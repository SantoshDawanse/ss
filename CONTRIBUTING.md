# Contributing to Sikshya-Sathi

Thank you for your interest in contributing to the Sikshya-Sathi project!

## Development Setup

### Prerequisites

- Python 3.11+ (for Cloud Brain)
- Node.js 18+ (for Local Brain)
- AWS Account with Bedrock access
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd sikshya-sathi

# Install all dependencies
make setup

# Or install individually
make setup-cloud
make setup-local
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name develop
```

### 2. Make Changes

- Follow the coding standards (see below)
- Write tests for new functionality
- Update documentation as needed

### 3. Run Tests

```bash
# Run all tests
make test

# Run specific component tests
make test-cloud
make test-local

# Run property-based tests
make test-pbt
```

### 4. Lint Your Code

```bash
# Lint all code
make lint

# Lint specific component
make lint-cloud
make lint-local
```

### 5. Submit a Pull Request

- Push your branch to the repository
- Create a pull request against `develop`
- Ensure all CI checks pass
- Request review from maintainers

## Coding Standards

### Cloud Brain (Python)

- Follow PEP 8 style guide
- Use type hints for all functions
- Use ruff for linting and formatting
- Write docstrings for all public functions
- Minimum test coverage: 70%

```python
def example_function(param: str) -> int:
    """
    Brief description of function.
    
    Args:
        param: Description of parameter
        
    Returns:
        Description of return value
    """
    return len(param)
```

### Local Brain (TypeScript)

- Follow ESLint configuration
- Use TypeScript strict mode
- Write JSDoc comments for exported functions
- Minimum test coverage: 70%

```typescript
/**
 * Brief description of function.
 * 
 * @param param - Description of parameter
 * @returns Description of return value
 */
export function exampleFunction(param: string): number {
  return param.length;
}
```

## Testing Guidelines

### Unit Tests

- Test specific examples and edge cases
- Mock external dependencies
- Focus on single units of functionality

### Property-Based Tests

- Test universal properties across all inputs
- Use hypothesis (Python) or fast-check (TypeScript)
- Minimum 100 iterations per property test
- Tag with property number from design document

Example:
```python
@pytest.mark.property_test
@given(data=st.data())
def test_property_1_curriculum_alignment(data):
    """
    Property 1: Content Curriculum Alignment
    Validates: Requirements 2.2, 2.10, 6.1, 6.2
    """
    # Test implementation
```

## Commit Message Format

Use conventional commits format:

```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions or changes
- `refactor`: Code refactoring
- `chore`: Build/tooling changes

Example:
```
feat(cloud-brain): add MCP server curriculum integration

Implement MCP server tools for accessing Nepal K-12 curriculum
standards. Includes get_curriculum_standards and get_topic_details.

Closes #123
```

## Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Include tests for new functionality
- Update documentation as needed
- Ensure all CI checks pass
- Request review from at least one maintainer
- Address review feedback promptly

## Questions?

If you have questions, please:
1. Check existing documentation
2. Search existing issues
3. Create a new issue with the `question` label

Thank you for contributing!
