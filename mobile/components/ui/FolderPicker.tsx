import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fileSystemApi } from '../../services/api';
import { DirectoryEntry } from '../../types';

interface FolderPickerProps {
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export default function FolderPicker({ onSelect, onCancel }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pathHistory, setPathHistory] = useState<string[]>([]);

  useEffect(() => {
    loadDirectory();
  }, [currentPath]);

  const loadDirectory = async () => {
    setLoading(true);
    try {
      const response = await fileSystemApi.list(currentPath || undefined);
      setEntries(response.entries);
      setCurrentPath(response.current_path);
    } catch (error) {
      console.error('Failed to load directory:', error);
      Alert.alert('Error', 'Failed to load directory contents');
    } finally {
      setLoading(false);
    }
  };

  const navigateToDirectory = (path: string) => {
    setPathHistory([...pathHistory, currentPath]);
    setCurrentPath(path);
  };

  const navigateBack = () => {
    if (pathHistory.length > 0) {
      const previousPath = pathHistory[pathHistory.length - 1];
      setPathHistory(pathHistory.slice(0, -1));
      setCurrentPath(previousPath);
    }
  };

  const navigateToParent = () => {
    if (currentPath) {
      const parentPath = currentPath.split('/').slice(0, -1).join('/');
      navigateToDirectory(parentPath || '/');
    }
  };

  const handleEntryPress = (entry: DirectoryEntry) => {
    if (entry.is_directory) {
      navigateToDirectory(entry.path);
    }
  };

  const handleSelectCurrent = () => {
    onSelect(currentPath);
  };

  const renderEntry = (entry: DirectoryEntry) => {
    const isGitRepo = entry.is_git_repo;
    const iconName = entry.is_directory 
      ? (isGitRepo ? 'git-branch' : 'folder') 
      : 'document-text';
    const iconColor = entry.is_directory 
      ? (isGitRepo ? '#f59e0b' : '#3b82f6') 
      : '#6b7280';

    return (
      <TouchableOpacity
        key={entry.path}
        style={[styles.entry, !entry.is_directory && styles.entryDisabled]}
        onPress={() => handleEntryPress(entry)}
        disabled={!entry.is_directory}
      >
        <Ionicons name={iconName as any} size={20} color={iconColor} />
        <Text style={[styles.entryName, !entry.is_directory && styles.entryNameDisabled]}>
          {entry.name}
        </Text>
        {isGitRepo && (
          <View style={styles.gitBadge}>
            <Text style={styles.gitBadgeText}>GIT</Text>
          </View>
        )}
        {entry.is_directory && (
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={onCancel}>
            <Text style={styles.headerButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Folder</Text>
          <TouchableOpacity style={styles.headerButton} onPress={handleSelectCurrent}>
            <Text style={[styles.headerButtonText, styles.selectButtonText]}>Select</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pathContainer}>
          <TouchableOpacity
            style={styles.pathButton}
            onPress={navigateBack}
            disabled={pathHistory.length === 0}
          >
            <Ionicons 
              name="chevron-back" 
              size={16} 
              color={pathHistory.length > 0 ? "#3b82f6" : "#9ca3af"} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.pathButton} onPress={navigateToParent}>
            <Ionicons name="chevron-up" size={16} color="#3b82f6" />
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pathScroll}>
            <Text style={styles.currentPath}>
              {currentPath || '/'}
            </Text>
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading directory...</Text>
          </View>
        ) : (
          <ScrollView style={styles.entriesContainer}>
            {entries.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyText}>This directory is empty</Text>
              </View>
            ) : (
              entries.map(renderEntry)
            )}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <Ionicons name="folder" size={16} color="#3b82f6" />
              <Text style={styles.legendText}>Folder</Text>
            </View>
            <View style={styles.legendItem}>
              <Ionicons name="git-branch" size={16} color="#f59e0b" />
              <Text style={styles.legendText}>Git Repository</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerButton: {
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    color: '#6b7280',
  },
  selectButtonText: {
    color: '#3b82f6',
    fontWeight: '600',
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  pathContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  pathButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  pathScroll: {
    flex: 1,
  },
  currentPath: {
    fontSize: 14,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
  },
  entriesContainer: {
    flex: 1,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  entryDisabled: {
    opacity: 0.5,
  },
  entryName: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 12,
  },
  entryNameDisabled: {
    color: '#9ca3af',
  },
  gitBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  gitBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendText: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 6,
  },
});