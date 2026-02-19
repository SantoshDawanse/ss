.PHONY: help setup test lint clean deploy-dev deploy-staging

help:
	@echo "Sikshya-Sathi Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup              - Install all dependencies"
	@echo "  make setup-cloud        - Install Cloud Brain dependencies"
	@echo "  make setup-local        - Install Local Brain dependencies"
	@echo ""
	@echo "Testing:"
	@echo "  make test               - Run all tests"
	@echo "  make test-cloud         - Run Cloud Brain tests"
	@echo "  make test-local         - Run Local Brain tests"
	@echo "  make test-pbt           - Run property-based tests only"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint               - Run linters on all code"
	@echo "  make lint-cloud         - Lint Cloud Brain code"
	@echo "  make lint-local         - Lint Local Brain code"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy-dev         - Deploy to development environment"
	@echo "  make deploy-staging     - Deploy to staging environment"
	@echo "  make redeploy-lambda    - Redeploy Lambda with fixed packaging"
	@echo "  make test-lambda        - Test Lambda function invocation"
	@echo "  make status             - Show deployment status"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean              - Remove build artifacts"

# Setup commands
setup: setup-cloud setup-local

setup-cloud:
	cd cloud-brain && pip install -r requirements.txt -r requirements-dev.txt

setup-local:
	cd local-brain && npm install

# Testing commands
test: test-cloud test-local

test-cloud:
	cd cloud-brain && pytest

test-local:
	cd local-brain && npm test

test-pbt:
	cd cloud-brain && pytest -m property_test
	cd local-brain && npm run test:pbt

# Linting commands
lint: lint-cloud lint-local

lint-cloud:
	cd cloud-brain && ruff check src tests
	cd cloud-brain && mypy src

lint-local:
	cd local-brain && npm run lint
	cd local-brain && npm run type-check

# Deployment commands
deploy-dev:
	cd cloud-brain/infrastructure && cdk deploy --context environment=development

deploy-staging:
	cd cloud-brain/infrastructure && cdk deploy --context environment=staging

redeploy-lambda:
	@echo "Redeploying Lambda with fixed packaging..."
	cd cloud-brain/infrastructure && cdk deploy --require-approval never

test-lambda:
	cd cloud-brain && python scripts/test_lambda_packaging.py

status:
	cd cloud-brain && python scripts/show_deployment_status.py

# Cleanup commands
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".mypy_cache" -exec rm -rf {} +
	find . -type d -name "node_modules" -exec rm -rf {} +
	find . -type d -name "build" -exec rm -rf {} +
	find . -type d -name "dist" -exec rm -rf {} +
	cd cloud-brain/infrastructure && rm -rf cdk.out
