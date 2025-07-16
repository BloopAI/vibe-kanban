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
import { CreateTask, CreateTaskAndStart, ExecutorConfig, TaskStatus } from '../../types';

interface TaskFormProps {
  projectId: string;
  initialData?: {
    title?: string;
    description?: string;
    status?: TaskStatus;
  };
  isEditing?: boolean;
  onSubmit: (data: CreateTask | CreateTaskAndStart) => Promise<void>;
  onCancel: () => void;
  showExecutorOptions?: boolean;
}

const executorOptions = [
  { value: { type: 'claude' }, label: 'Claude' },
  { value: { type: 'amp' }, label: 'Amp' },
  { value: { type: 'gemini' }, label: 'Gemini' },
  { value: { type: 'charmopencode' }, label: 'Charm OpenCode' },
  { value: { type: 'echo' }, label: 'Echo (Test Mode)' },
] as const;

const statusOptions = [
  { value: 'todo', label: 'To Do', color: '#6b7280' },
  { value: 'inprogress', label: 'In Progress', color: '#f59e0b' },
  { value: 'inreview', label: 'In Review', color: '#8b5cf6' },
  { value: 'done', label: 'Done', color: '#10b981' },
] as const;

export default function TaskForm({
  projectId,
  initialData,
  isEditing = false,
  onSubmit,
  onCancel,
  showExecutorOptions = false,
}: TaskFormProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [status, setStatus] = useState<TaskStatus>(initialData?.status || 'todo');
  const [selectedExecutor, setSelectedExecutor] = useState<ExecutorConfig | null>(
    showExecutorOptions ? executorOptions[0].value : null
  );
  const [startImmediately, setStartImmediately] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Task title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const baseData: CreateTask = {
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
      };

      if (showExecutorOptions && startImmediately && selectedExecutor) {
        const createAndStartData: CreateTaskAndStart = {
          ...baseData,
          executor: selectedExecutor,
        };
        await onSubmit(createAndStartData);
      } else {
        await onSubmit(baseData);
      }
    } catch (error) {
      console.error('Failed to submit task:', error);
      Alert.alert('Error', 'Failed to create task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderExecutorOption = (option: typeof executorOptions[0]) => {
    const isSelected = selectedExecutor?.type === option.value.type;
    return (
      <TouchableOpacity
        key={option.value.type}
        style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
        onPress={() => setSelectedExecutor(option.value)}
      >
        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
          {option.label}
        </Text>
        {isSelected && <Ionicons name="checkmark" size={16} color="#3b82f6" />}
      </TouchableOpacity>
    );
  };

  const renderStatusOption = (option: typeof statusOptions[0]) => {
    const isSelected = status === option.value;
    return (
      <TouchableOpacity
        key={option.value}
        style={[
          styles.statusButton,
          isSelected && [styles.statusButtonSelected, { borderColor: option.color }]
        ]}
        onPress={() => setStatus(option.value)}
      >
        <View style={[styles.statusIndicator, { backgroundColor: option.color }]} />
        <Text style={[styles.statusText, isSelected && styles.statusTextSelected]}>
          {option.label}
        </Text>
        {isSelected && <Ionicons name="checkmark" size={16} color={option.color} />}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Ionicons name="close" size={24} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Task' : 'Create Task'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Enter task title"
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what needs to be done..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {isEditing && (
          <View style={styles.field}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.optionsContainer}>
              {statusOptions.map(renderStatusOption)}
            </View>
          </View>
        )}

        {showExecutorOptions && (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Executor</Text>
              <View style={styles.optionsContainer}>
                {executorOptions.map(renderExecutorOption)}
              </View>
            </View>

            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setStartImmediately(!startImmediately)}
            >
              <View style={[styles.checkbox, startImmediately && styles.checkboxChecked]}>
                {startImmediately && (
                  <Ionicons name="checkmark" size={16} color="#ffffff" />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Start task immediately</Text>
            </TouchableOpacity>
          </>
        )}
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
              {isEditing ? 'Update Task' : showExecutorOptions && startImmediately ? 'Create & Start' : 'Create Task'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
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
    marginBottom: 8,
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
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionButtonSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  optionText: {
    fontSize: 16,
    color: '#374151',
  },
  optionTextSelected: {
    color: '#3b82f6',
    fontWeight: '500',
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusButtonSelected: {
    borderWidth: 2,
    backgroundColor: '#fafafa',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  statusTextSelected: {
    fontWeight: '500',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
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