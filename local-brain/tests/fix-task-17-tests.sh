#!/bin/bash
# Script to fix download info mock calls in integration tests

# Fix task-17.1 test file
sed -i.bak 's/\/\/ Mock download info response$/\/\/ Mock download info response (uses GET)/g' tests/task-17.1-complete-sync-flow-integration.test.ts
sed -i.bak 's/\/\/ Mock download info response (no upload needed)$/\/\/ Mock download info response (uses GET, no upload needed)/g' tests/task-17.1-complete-sync-flow-integration.test.ts

# Replace mockNetworkService.post with mockNetworkService.get for download info calls
# This is a bit tricky because we need to only replace the ones after "Mock download info"
# For now, manually fix the remaining occurrences

echo "Fixed test files. Please review the changes."
echo "Remaining manual fixes needed:"
echo "1. Change mockNetworkService.post to mockNetworkService.get for all download info responses"
echo "2. Remove the 'on' event listener test or implement event emitter in SyncOrchestratorService"
