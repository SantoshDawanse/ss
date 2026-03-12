/**
 * Custom hook for pull-to-refresh functionality
 * Provides consistent refresh behavior across screens
 */

import { useState } from 'react';

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  showSuccessMessage?: boolean;
}

export function usePullToRefresh({ onRefresh, showSuccessMessage = false }: UsePullToRefreshOptions) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      if (showSuccessMessage) {
        console.log('Refresh completed successfully');
      }
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  return {
    refreshing,
    onRefresh: handleRefresh,
  };
}