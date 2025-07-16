import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationSettings {
  enabled: boolean;
  taskUpdates: boolean;
  executionComplete: boolean;
  executionFailed: boolean;
  prUpdates: boolean;
  soundEnabled: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  taskUpdates: true,
  executionComplete: true,
  executionFailed: true,
  prUpdates: true,
  soundEnabled: false,
};

const SETTINGS_KEY = 'notification_settings';

class NotificationService {
  private static instance: NotificationService;
  private settings: NotificationSettings = DEFAULT_SETTINGS;
  private listeners: ((settings: NotificationSettings) => void)[] = [];

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private constructor() {
    this.loadSettings();
  }

  private async loadSettings() {
    try {
      const storedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (storedSettings) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) };
      }
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    }
  }

  async updateSettings(newSettings: Partial<NotificationSettings>) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to save notification settings:', error);
    }
  }

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  subscribe(listener: (settings: NotificationSettings) => void): () => void {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getSettings()));
  }

  // Notification methods
  showTaskUpdate(taskTitle: string, status: string) {
    if (!this.settings.enabled || !this.settings.taskUpdates) return;
    
    Alert.alert(
      'Task Updated',
      `"${taskTitle}" is now ${status}`,
      [{ text: 'OK' }]
    );
  }

  showExecutionComplete(taskTitle: string) {
    if (!this.settings.enabled || !this.settings.executionComplete) return;
    
    Alert.alert(
      'Execution Complete',
      `Task "${taskTitle}" has finished executing successfully`,
      [{ text: 'OK' }]
    );
  }

  showExecutionFailed(taskTitle: string, error?: string) {
    if (!this.settings.enabled || !this.settings.executionFailed) return;
    
    Alert.alert(
      'Execution Failed',
      `Task "${taskTitle}" execution failed${error ? `: ${error}` : ''}`,
      [{ text: 'OK' }]
    );
  }

  showPRUpdate(taskTitle: string, prUrl: string) {
    if (!this.settings.enabled || !this.settings.prUpdates) return;
    
    Alert.alert(
      'Pull Request Ready',
      `Pull request created for "${taskTitle}"`,
      [
        { text: 'OK' },
        { text: 'View PR', onPress: () => this.openPR(prUrl) }
      ]
    );
  }

  private openPR(url: string) {
    // In a real app, you would use Linking.openURL(url)
    console.log('Opening PR:', url);
  }

  showGenericNotification(title: string, message: string) {
    if (!this.settings.enabled) return;
    
    Alert.alert(title, message, [{ text: 'OK' }]);
  }
}

export const notificationService = NotificationService.getInstance();