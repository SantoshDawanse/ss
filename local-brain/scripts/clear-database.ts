/**
 * Script to clear the local database
 * Run this if you encounter UNIQUE constraint errors
 */

import * as SQLite from 'expo-sqlite';

async function clearDatabase() {
  try {
    console.log('Clearing database...');
    
    // Delete the database file
    await SQLite.deleteDatabaseAsync('sikshya_sathi.db');
    
    console.log('Database cleared successfully!');
    console.log('Restart the app to reinitialize with fresh data.');
  } catch (error) {
    console.error('Error clearing database:', error);
  }
}

clearDatabase();
