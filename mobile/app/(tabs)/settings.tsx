import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [soundEnabled, setSoundEnabled] = React.useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = React.useState(false);

  return (
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
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={notificationsEnabled ? '#3b82f6' : '#f3f4f6'}
            />
          }
        />
        <SettingItem
          title="Sound Alerts"
          subtitle="Play sounds for notifications"
          icon="volume-medium-outline"
          rightElement={
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={soundEnabled ? '#3b82f6' : '#f3f4f6'}
            />
          }
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <SettingItem
          title="Dark Mode"
          subtitle="Switch to dark theme"
          icon="moon-outline"
          rightElement={
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={darkModeEnabled ? '#3b82f6' : '#f3f4f6'}
            />
          }
        />
        <SettingItem
          title="Theme"
          subtitle="Customize app colors"
          icon="color-palette-outline"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <SettingItem
          title="GitHub Integration"
          subtitle="Connect your GitHub account"
          icon="logo-github"
        />
        <SettingItem
          title="Sync Settings"
          subtitle="Backup your preferences"
          icon="cloud-outline"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Developer</Text>
        <SettingItem
          title="Server Configuration"
          subtitle="Configure backend connection"
          icon="server-outline"
        />
        <SettingItem
          title="Debug Mode"
          subtitle="Enable development features"
          icon="bug-outline"
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
        <SettingItem
          title="Privacy Policy"
          subtitle="Learn about data usage"
          icon="shield-checkmark-outline"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
});