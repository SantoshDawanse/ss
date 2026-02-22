/**
 * App Context - Provides global state and services
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { DatabaseManager } from '../database/DatabaseManager';
import { ContentDeliveryService } from '../services/ContentDeliveryService';
import { PerformanceTrackingService } from '../services/PerformanceTrackingService';
import { StatePersistenceService } from '../services/StatePersistenceService';
import { AdaptiveContentSelectionService } from '../services/AdaptiveContentSelectionService';
import { LocalizationService } from '../services/LocalizationService';
import { AccessibilityService } from '../services/AccessibilityService';
import { CulturalContextService } from '../services/CulturalContextService';
import { initializeDatabase } from '../utils/initializeDatabase';
import { SAMPLE_STUDENT_ID } from '../utils/sampleData';

interface AppContextType {
  dbManager: DatabaseManager | null;
  contentService: ContentDeliveryService | null;
  performanceService: PerformanceTrackingService | null;
  stateService: StatePersistenceService | null;
  adaptiveService: AdaptiveContentSelectionService | null;
  localizationService: LocalizationService | null;
  accessibilityService: AccessibilityService | null;
  culturalContextService: CulturalContextService | null;
  studentId: string;
  isInitialized: boolean;
  error: string | null;
}

const AppContext = createContext<AppContextType>({
  dbManager: null,
  contentService: null,
  performanceService: null,
  stateService: null,
  adaptiveService: null,
  localizationService: null,
  accessibilityService: null,
  culturalContextService: null,
  studentId: SAMPLE_STUDENT_ID,
  isInitialized: false,
  error: null,
});

export const useApp = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbManager, setDbManager] = useState<DatabaseManager | null>(null);
  const [contentService, setContentService] = useState<ContentDeliveryService | null>(null);
  const [performanceService, setPerformanceService] = useState<PerformanceTrackingService | null>(null);
  const [stateService, setStateService] = useState<StatePersistenceService | null>(null);
  const [adaptiveService, setAdaptiveService] = useState<AdaptiveContentSelectionService | null>(null);
  const [localizationService, setLocalizationService] = useState<LocalizationService | null>(null);
  const [accessibilityService, setAccessibilityService] = useState<AccessibilityService | null>(null);
  const [culturalContextService, setCulturalContextService] = useState<CulturalContextService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('Initializing app services...');

        // Initialize localization and accessibility services first
        const localization = LocalizationService.getInstance();
        await localization.initialize();
        setLocalizationService(localization);

        const accessibility = AccessibilityService.getInstance();
        await accessibility.initialize();
        setAccessibilityService(accessibility);

        const culturalContext = CulturalContextService.getInstance();
        setCulturalContextService(culturalContext);

        // Initialize database using getInstance
        const db = DatabaseManager.getInstance();
        await db.initialize();
        setDbManager(db);

        // Initialize sample data
        await initializeDatabase(db);

        // Initialize services
        const content = new ContentDeliveryService(db);
        const performance = new PerformanceTrackingService(db);
        const state = new StatePersistenceService(db);
        const adaptive = new AdaptiveContentSelectionService(db);

        setContentService(content);
        setPerformanceService(performance);
        setStateService(state);
        setAdaptiveService(adaptive);

        // Initialize state persistence (starts auto-save)
        await state.initialize(SAMPLE_STUDENT_ID);

        setIsInitialized(true);
        console.log('App initialization complete!');
      } catch (err) {
        console.error('Failed to initialize app:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    initialize();

    return () => {
      // Cleanup
      if (stateService) {
        stateService.stopAutoSave();
      }
      if (accessibilityService) {
        accessibilityService.stopSpeaking();
      }
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        dbManager,
        contentService,
        performanceService,
        stateService,
        adaptiveService,
        localizationService,
        accessibilityService,
        culturalContextService,
        studentId: SAMPLE_STUDENT_ID,
        isInitialized,
        error,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
