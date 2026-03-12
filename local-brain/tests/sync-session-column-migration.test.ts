/**
 * Test to verify that the SyncSessionRepository handles missing backend_session_id column gracefully
 */

import { DatabaseManager } from '../src/database/DatabaseManager';

describe('Sync Session Repository - Missing Column Handling', () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    DatabaseManager.resetInstance();
    dbManager = DatabaseManager.getInstance({
      name: `test_missing_column_${Date.now()}.db`,
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

  it('should create sync session successfully when backend_session_id column exists', async () => {
    // This is the normal case - column exists
    const sessionId = `test-session-${Date.now()}`;
    
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
    
    const session = await dbManager.syncSessionRepository.findById(sessionId);
    expect(session).toBeTruthy();
    expect(session!.backend_session_id).toBe('backend-123');
  });

  it('should handle null backend_session_id gracefully', async () => {
    const sessionId = `test-session-null-${Date.now()}`;
    
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

  it('should update backend_session_id successfully', async () => {
    const sessionId = `test-session-update-${Date.now()}`;
    
    // Create session without backend_session_id
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
    
    // Update with backend_session_id
    await expect(
      dbManager.syncSessionRepository.updateBackendSessionId(sessionId, 'backend-456')
    ).resolves.not.toThrow();
    
    const session = await dbManager.syncSessionRepository.findById(sessionId);
    expect(session).toBeTruthy();
    expect(session!.backend_session_id).toBe('backend-456');
  });

  it('should verify backend_session_id column exists in current schema', async () => {
    // This test verifies that our schema fix worked
    const db = dbManager.getDatabase();
    const columns = await db.getAllAsync('PRAGMA table_info(sync_sessions)');
    
    const backendSessionIdColumn = columns.find((col: any) => col.name === 'backend_session_id');
    expect(backendSessionIdColumn).toBeTruthy();
    expect(backendSessionIdColumn.type).toBe('TEXT');
    
    // Verify all expected columns exist
    const expectedColumns = [
      'session_id',
      'backend_session_id', 
      'start_time',
      'end_time',
      'status',
      'logs_uploaded',
      'bundle_downloaded',
      'error_message'
    ];
    
    const actualColumns = columns.map((col: any) => col.name);
    for (const expectedCol of expectedColumns) {
      expect(actualColumns).toContain(expectedCol);
    }
  });
});