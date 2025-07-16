import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authService, AuthState } from '../../services/auth';
import { notificationService, NotificationSettings } from '../../services/notifications';
import { getBaseUrl, setBaseUrl } from '../../services/api';
import { Config } from '../../types';

interface SettingItemProps {
  title: string;
  subtitle?: string;
  icon: any;
  onPress?: () => void;
  rightElement?: React.ReactNode;
}

function SettingItem({ title, subtitle, icon, onPress, rightElement }: SettingItemProps) {
  return (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingLeft}>
        <Ionicons name={icon} size={24} color="#3b82f6" />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={20} color="#9ca3af" />}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribeAuth = authService.subscribe(setAuthState);
    
    // Subscribe to notification settings changes
    const unsubscribeNotifications = notificationService.subscribe(setNotificationSettings);
    
    // Load current server URL
    loadServerUrl();

    return () => {
      unsubscribeAuth();
      unsubscribeNotifications();
    };
  }, []);

  const loadServerUrl = async () => {
    const url = await getBaseUrl();
    setServerUrl(url);
  };

  const handleNotificationToggle = (key: keyof NotificationSettings, value: boolean) => {
    notificationService.updateSettings({ [key]: value });
  };

  const handleThemeChange = async (theme: string) => {
    if (!authState?.config) return;
    
    const updatedConfig = { ...authState.config, theme: theme as any };
    const success = await authService.saveConfig(updatedConfig);
    
    if (!success) {
      Alert.alert('Error', 'Failed to update theme');
    }
  };

  const handleGitHubAuth = async () => {
    try {
      const authData = await authService.startGithubAuth();
      
      Alert.alert(
        'GitHub Authentication',
        `Go to ${authData.verification_uri} and enter code: ${authData.user_code}`,
        [
          { text: 'Cancel' },
          { 
            text: 'Done', 
            onPress: () => pollGitHubAuth(authData.device_code) 
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to start GitHub authentication');
    }
  };

  const pollGitHubAuth = async (deviceCode: string) => {
    try {
      await authService.pollGithubAuth(deviceCode);
      Alert.alert('Success', 'GitHub account connected successfully!');
    } catch (error) {
      Alert.alert('Error', 'GitHub authentication failed');
    }
  };

  const handleServerConfigSave = async () => {
    try {
      await setBaseUrl(serverUrl);
      setShowServerConfig(false);
      Alert.alert('Success', 'Server configuration updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update server configuration');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? This will clear all local data.',
      [
        { text: 'Cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: () => authService.logout()
        }
      ]
    );
  };

  if (!authState || !notificationSettings) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading settings...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Customize your experience</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <SettingItem
            title="Push Notifications"
            subtitle="Get notified about task updates"
            icon="notifications-outline"
            rightElement={
              <Switch
                value={notificationSettings.enabled}
                onValueChange={(value) => handleNotificationToggle('enabled', value)}
                trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                thumbColor={notificationSettings.enabled ? '#3b82f6' : '#f3f4f6'}
              />
            }
          />
          <SettingItem
            title="Task Updates"
            subtitle="Notify when task status changes"
            icon="checkmark-circle-outline"
            rightElement={
              <Switch
                value={notificationSettings.taskUpdates}
                onValueChange={(value) => handleNotificationToggle('taskUpdates', value)}
                trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                thumbColor={notificationSettings.taskUpdates ? '#3b82f6' : '#f3f4f6'}
              />
            }
          />
          <SettingItem
            title="Execution Complete"
            subtitle="Notify when task execution finishes"
            icon="play-circle-outline"
            rightElement={
              <Switch
                value={notificationSettings.executionComplete}
                onValueChange={(value) => handleNotificationToggle('executionComplete', value)}
                trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                thumbColor={notificationSettings.executionComplete ? '#3b82f6' : '#f3f4f6'}
              />
            }
          />
          <SettingItem
            title="Sound Alerts"
            subtitle="Play sounds for notifications"
            icon="volume-medium-outline"
            rightElement={
              <Switch
                value={notificationSettings.soundEnabled}
                onValueChange={(value) => handleNotificationToggle('soundEnabled', value)}
                trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                thumbColor={notificationSettings.soundEnabled ? '#3b82f6' : '#f3f4f6'}
              />
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <SettingItem
            title="Theme"
            subtitle={`Current: ${authState.config?.theme || 'system'}`}
            icon="color-palette-outline"
            onPress={() => {
              Alert.alert(
                'Select Theme',
                'Choose your preferred theme',
                [
                  { text: 'Light', onPress: () => handleThemeChange('light') },
                  { text: 'Dark', onPress: () => handleThemeChange('dark') },
                  { text: 'System', onPress: () => handleThemeChange('system') },
                  { text: 'Cancel' }
                ]
              );
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <SettingItem
            title="GitHub Integration"
            subtitle={authState.hasGithubToken ? 'Connected' : 'Not connected'}
            icon="logo-github"
            onPress={handleGitHubAuth}
            rightElement={
              authState.hasGithubToken ? (
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              )
            }
          />
          <SettingItem
            title="Authentication Status"
            subtitle={authState.isAuthenticated ? 'Connected to server' : 'Not connected'}
            icon="shield-checkmark-outline"
            rightElement={
              authState.isAuthenticated ? (
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              ) : (
                <Ionicons name="alert-circle" size={20} color="#ef4444" />
              )
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Developer</Text>
          <SettingItem
            title="Server Configuration"
            subtitle={`Current: ${serverUrl}`}
            icon="server-outline"
            onPress={() => setShowServerConfig(true)}
          />
          <SettingItem
            title="Executor Type"
            subtitle={`Current: ${authState.config?.executor?.type || 'Not configured'}`}
            icon="terminal-outline"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <SettingItem
            title="Version"
            subtitle="1.0.0"
            icon="information-circle-outline"
          />
          <SettingItem
            title="Help & Support"
            subtitle="Get help or report issues"
            icon="help-circle-outline"
          />
        </View>

        <View style={styles.section}>
          <SettingItem
            title="Logout"
            subtitle="Clear all local data"
            icon="log-out-outline"
            onPress={handleLogout}
            rightElement={<Ionicons name="chevron-forward" size={20} color="#ef4444" />}
          />
        </View>
      </ScrollView>

      <Modal
        visible={showServerConfig}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowServerConfig(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowServerConfig(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Server Configuration</Text>
            <TouchableOpacity onPress={handleServerConfigSave}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <Text style={styles.modalLabel}>Server URL</Text>
            <TextInput
              style={styles.modalInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://localhost:3001"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalDescription}>
              Enter the URL of your Vibe Kanban backend server. Make sure the server is running and accessible.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  section: {
    marginTop: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#f9fafb',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#6b7280',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  modalSaveText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  modalContent: {
    padding: 20,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
});