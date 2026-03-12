/**
 * Test to verify that the backend_session_id column issue is fixed
 */

import { DatabaseManager } from '../src/database/DatabaseManager';

describe('Backend Session ID Fix', () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Create a fresh database manager for each test
    DatabaseManager.resetInstance();
    dbManager = DatabaseManager.getInstance({
      name: `test_backend_session_fix_${Date.now()}.db`,
      location: 'default',
      encryption: false,
    });
    
    await dbManager.initialize();
  });

  afterEach(async () => {
    if (dbManager) {
      await dbManager.close();
    }
  });

  it('should create sync session with backend_session_id without errors', async () => {
    // This test verifies that the original error is fixed:
    // "table sync_sessions has no column named backend_session_id"
    
    const sessionId = `test-session-${Date.now()}`;
    
    // This should not throw an error
    await expect(
      dbManager.syncSessionRepository.create({
        session_id: sessionId,
        backend_session_id: 'backend-123',
        start_time: Date.now(),
        end_time: null,
        status: 'pending',
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: null,
      })
    ).resolves.not.toThrow();
    
    // Verify the session was created with the backend_session_id
    const session = await dbManager.syncSessionRepository.findById(sessionId);
    expect(session).toBeTruthy();
    expect(session!.backend_session_id).toBe('backend-123');
  });

  it('should update backend_session_id without errors', async () => {
    // Create a session without backend_session_id
    const sessionId = `test-session-${Date.now()}`;
    
    await dbManager.syncSessionRepository.create({
      session_id: sessionId,
      backend_session_id: null,
      start_time: Date.now(),
      end_time: null,
      status: 'pending',
      logs_uploaded: 0,
      bundle_downloaded: 0,
      error_message: null,
    });
    
    // Update with backend_session_id - this should not throw an error
    await expect(
      dbManager.syncSessionRepository.updateBackendSessionId(sessionId, 'backend-456')
    ).resolves.not.toThrow();
    
    // Verify the update worked
    const session = await dbManager.syncSessionRepository.findById(sessionId);
    expect(session).toBeTruthy();
    expect(session!.backend_session_id).toBe('backend-456');
  });

  it('should handle null backend_session_id gracefully', async () => {
    // Test that null values work correctly
    const sessionId = `test-session-${Date.now()}`;
    
    await expect(
      dbManager.syncSessionRepository.create({
        session_id: sessionId,
        backend_session_id: null,
        start_time: Date.now(),
        end_time: null,
        status: 'pending',
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: null,
      })
    ).resolves.not.toThrow();
    
    const session = await dbManager.syncSessionRepository.findById(sessionId);
    expect(session).toBeTruthy();
    expect(session!.backend_session_id).toBeNull();
  });
});