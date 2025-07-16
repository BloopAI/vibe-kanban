import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  TaskAttemptState, 
  ExecutionProcessSummary, 
  ExecutionState,
  NormalizedConversation 
} from '../../types';
import { attemptsApi, executionProcessesApi } from '../../services/api';
import { wsService } from '../../services/websocket';

interface ExecutionMonitorProps {
  projectId: string;
  taskId: string;
  attemptId: string;
  onClose: () => void;
}

const executionStateColors = {
  NotStarted: '#6b7280',
  SetupRunning: '#f59e0b',
  SetupComplete: '#10b981',
  SetupFailed: '#ef4444',
  CodingAgentRunning: '#3b82f6',
  CodingAgentComplete: '#10b981',
  CodingAgentFailed: '#ef4444',
  Complete: '#10b981',
};

const executionStateLabels = {
  NotStarted: 'Not Started',
  SetupRunning: 'Running Setup',
  SetupComplete: 'Setup Complete',
  SetupFailed: 'Setup Failed',
  CodingAgentRunning: 'Agent Running',
  CodingAgentComplete: 'Agent Complete',
  CodingAgentFailed: 'Agent Failed',
  Complete: 'Complete',
};

export default function ExecutionMonitor({
  projectId,
  taskId,
  attemptId,
  onClose,
}: ExecutionMonitorProps) {
  const [attemptState, setAttemptState] = useState<TaskAttemptState | null>(null);
  const [processes, setProcesses] = useState<ExecutionProcessSummary[]>([]);
  const [logs, setLogs] = useState<NormalizedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);

  useEffect(() => {
    loadExecutionData();
    
    // Subscribe to WebSocket updates
    const unsubscribe = wsService.on('execution_update', handleExecutionUpdate);
    
    return unsubscribe;
  }, [projectId, taskId, attemptId]);

  const loadExecutionData = async () => {
    try {
      setLoading(true);
      const [state, processList] = await Promise.all([
        attemptsApi.getState(projectId, taskId, attemptId),
        attemptsApi.getExecutionProcesses(projectId, taskId, attemptId)
      ]);
      
      setAttemptState(state);
      setProcesses(processList);
      
      // Load logs for the first process if available
      if (processList.length > 0 && !selectedProcessId) {
        setSelectedProcessId(processList[0].id);
        loadProcessLogs(processList[0].id);
      }
    } catch (error) {
      console.error('Failed to load execution data:', error);
      Alert.alert('Error', 'Failed to load execution data');
    } finally {
      setLoading(false);
    }
  };

  const loadProcessLogs = async (processId: string) => {
    try {
      const conversation = await executionProcessesApi.getNormalizedLogs(projectId, processId);
      setLogs(conversation);
    } catch (error) {
      console.error('Failed to load process logs:', error);
    }
  };

  const handleExecutionUpdate = (data: any) => {
    // Update execution state based on WebSocket messages
    if (data.attempt_id === attemptId) {
      loadExecutionData();
    }
  };

  const handleStopExecution = async () => {
    try {
      await attemptsApi.stop(projectId, taskId, attemptId);
      Alert.alert('Success', 'Execution stopped');
      loadExecutionData();
    } catch (error) {
      console.error('Failed to stop execution:', error);
      Alert.alert('Error', 'Failed to stop execution');
    }
  };

  const handleStopProcess = async (processId: string) => {
    try {
      await attemptsApi.stopExecutionProcess(projectId, taskId, attemptId, processId);
      Alert.alert('Success', 'Process stopped');
      loadExecutionData();
    } catch (error) {
      console.error('Failed to stop process:', error);
      Alert.alert('Error', 'Failed to stop process');
    }
  };

  const renderExecutionState = () => {
    if (!attemptState) return null;
    
    const state = attemptState.execution_state;
    const color = executionStateColors[state];
    const label = executionStateLabels[state];
    
    return (
      <View style={styles.stateContainer}>
        <View style={[styles.stateIndicator, { backgroundColor: color }]} />
        <Text style={styles.stateLabel}>{label}</Text>
        {(state === 'SetupRunning' || state === 'CodingAgentRunning') && (
          <TouchableOpacity style={styles.stopButton} onPress={handleStopExecution}>
            <Ionicons name="stop" size={16} color="#ef4444" />
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderProcess = (process: ExecutionProcessSummary) => {
    const isSelected = selectedProcessId === process.id;
    const isRunning = process.status === 'running';
    
    return (
      <TouchableOpacity
        key={process.id}
        style={[styles.processItem, isSelected && styles.processItemSelected]}
        onPress={() => {
          setSelectedProcessId(process.id);
          loadProcessLogs(process.id);
        }}
      >
        <View style={styles.processHeader}>
          <Text style={styles.processType}>{process.process_type}</Text>
          {isRunning && (
            <TouchableOpacity
              style={styles.processStopButton}
              onPress={() => handleStopProcess(process.id)}
            >
              <Ionicons name="stop-circle" size={16} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.processCommand}>{process.command}</Text>
        <View style={styles.processStatus}>
          <View style={[
            styles.statusIndicator, 
            { backgroundColor: process.status === 'running' ? '#f59e0b' : 
                              process.status === 'completed' ? '#10b981' : '#ef4444' }
          ]} />
          <Text style={styles.statusText}>{process.status}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderLogs = () => {
    if (!logs) return null;
    
    return (
      <ScrollView style={styles.logsContainer}>
        <View style={styles.logsHeader}>
          <Text style={styles.logsTitle}>Execution Logs</Text>
          <Text style={styles.logsExecutor}>{logs.executor_type}</Text>
        </View>
        
        {logs.entries.map((entry, index) => (
          <View key={index} style={styles.logEntry}>
            <View style={styles.logEntryHeader}>
              <Text style={styles.logEntryType}>{entry.entry_type.type}</Text>
              {entry.timestamp && (
                <Text style={styles.logEntryTime}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </Text>
              )}
            </View>
            <Text style={styles.logEntryContent}>{entry.content}</Text>
          </View>
        ))}
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading execution data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Execution Monitor</Text>
        <View style={styles.placeholder} />
      </View>

      {renderExecutionState()}

      <View style={styles.content}>
        <View style={styles.processesPanel}>
          <Text style={styles.panelTitle}>Processes</Text>
          <ScrollView style={styles.processesList}>
            {processes.map(renderProcess)}
          </ScrollView>
        </View>

        <View style={styles.logsPanel}>
          {renderLogs()}
        </View>
      </View>
    </View>
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
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
  closeButton: {
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
  stateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  stateIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  stateLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  stopButtonText: {
    fontSize: 14,
    color: '#ef4444',
    marginLeft: 4,
  },
  content: {
    flex: 1,
  },
  processesPanel: {
    height: 200,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  processesList: {
    flex: 1,
  },
  processItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  processItemSelected: {
    backgroundColor: '#eff6ff',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  processHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  processType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    textTransform: 'capitalize',
  },
  processStopButton: {
    padding: 4,
  },
  processCommand: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  processStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'capitalize',
  },
  logsPanel: {
    flex: 1,
  },
  logsContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  logsExecutor: {
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  logEntry: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  logEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logEntryType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    textTransform: 'capitalize',
  },
  logEntryTime: {
    fontSize: 10,
    color: '#9ca3af',
  },
  logEntryContent: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});