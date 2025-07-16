import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CreateProject, UpdateProject } from '../../types';
import FolderPicker from '../ui/FolderPicker';

interface ProjectFormProps {
  initialData?: {
    name?: string;
    git_repo_path?: string;
    setup_script?: string;
    dev_script?: string;
  };
  isEditing?: boolean;
  onSubmit: (data: CreateProject | UpdateProject) => Promise<void>;
  onCancel: () => void;
}

export default function ProjectForm({
  initialData,
  isEditing = false,
  onSubmit,
  onCancel,
}: ProjectFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [gitRepoPath, setGitRepoPath] = useState(initialData?.git_repo_path || '');
  const [setupScript, setSetupScript] = useState(initialData?.setup_script || '');
  const [devScript, setDevScript] = useState(initialData?.dev_script || '');
  const [useExistingRepo, setUseExistingRepo] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Project name is required');
      return;
    }

    if (!gitRepoPath.trim()) {
      Alert.alert('Error', 'Repository path is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        const updateData: UpdateProject = {
          name: name.trim(),
          git_repo_path: gitRepoPath.trim(),
          setup_script: setupScript.trim() || null,
          dev_script: devScript.trim() || null,
        };
        await onSubmit(updateData);
      } else {
        const createData: CreateProject = {
          name: name.trim(),
          git_repo_path: gitRepoPath.trim(),
          use_existing_repo: useExistingRepo,
          setup_script: setupScript.trim() || null,
          dev_script: devScript.trim() || null,
        };
        await onSubmit(createData);
      }
    } catch (error) {
      console.error('Failed to submit project:', error);
      Alert.alert('Error', 'Failed to save project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFolderSelect = (path: string) => {
    setGitRepoPath(path);
    setShowFolderPicker(false);
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit Project' : 'Create Project'}
          </Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Project Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter project name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Repository Path *</Text>
            <View style={styles.pathInputContainer}>
              <TextInput
                style={[styles.input, styles.pathInput]}
                value={gitRepoPath}
                onChangeText={setGitRepoPath}
                placeholder="/path/to/your/project"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => setShowFolderPicker(true)}
              >
                <Ionicons name="folder-outline" size={20} color="#3b82f6" />
              </TouchableOpacity>
            </View>
          </View>

          {!isEditing && (
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setUseExistingRepo(!useExistingRepo)}
            >
              <View style={[styles.checkbox, useExistingRepo && styles.checkboxChecked]}>
                {useExistingRepo && (
                  <Ionicons name="checkmark" size={16} color="#ffffff" />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Use existing repository</Text>
            </TouchableOpacity>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Setup Script</Text>
            <Text style={styles.fieldDescription}>
              Commands to run when setting up the project (e.g., npm install)
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={setupScript}
              onChangeText={setSetupScript}
              placeholder="npm install"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Dev Script</Text>
            <Text style={styles.fieldDescription}>
              Command to start the development server (e.g., npm run dev)
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={devScript}
              onChangeText={setDevScript}
              placeholder="npm run dev"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.cancelActionButton]}
            onPress={onCancel}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isEditing ? 'Update Project' : 'Create Project'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {showFolderPicker && (
        <FolderPicker
          onSelect={handleFolderSelect}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    flexGrow: 1,
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
  cancelButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  placeholder: {
    width: 32,
  },
  form: {
    flex: 1,
    padding: 20,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  fieldDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    minHeight: 48,
  },
  pathInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pathInput: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  browseButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderLeftWidth: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#374151',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelActionButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});