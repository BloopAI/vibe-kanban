import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import KanbanColumn from '../../components/KanbanColumn';
import TaskCard from '../../components/TaskCard';
import TaskForm from '../../components/forms/TaskForm';
import { MobileTask, Project, TaskWithAttemptStatus, CreateTask, CreateTaskAndStart } from '../../types';
import { projectsApi, tasksApi } from '../../services/api';

const columns = [
  { id: 'todo', title: 'To Do', status: 'todo' as const },
  { id: 'inprogress', title: 'In Progress', status: 'inprogress' as const },
  { id: 'inreview', title: 'In Review', status: 'inreview' as const },
  { id: 'done', title: 'Done', status: 'done' as const },
];

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams();
  const projectId = Array.isArray(id) ? id[0] : id;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<MobileTask[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const [projectData, tasksData] = await Promise.all([
        projectsApi.getById(projectId),
        tasksApi.getAll(projectId)
      ]);

      setProject(projectData);
      
      const mobileTasks: MobileTask[] = tasksData.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description || undefined,
        status: task.status,
        projectName: projectData.name,
        createdAt: task.created_at,
      }));
      
      setTasks(mobileTasks);
    } catch (error) {
      console.error('Failed to load project data:', error);
      Alert.alert('Error', 'Failed to load project data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTaskPress = (taskId: string) => {
    // Navigate to task detail screen when implemented
    console.log('Task pressed:', taskId);
  };

  const handleCreateTask = async (data: CreateTask | CreateTaskAndStart) => {
    try {
      if ('executor' in data) {
        // Create and start task
        await tasksApi.createAndStart(projectId, data);
      } else {
        // Just create task
        await tasksApi.create(projectId, data);
      }
      setShowTaskForm(false);
      await loadProjectData();
      Alert.alert('Success', 'Task created successfully!');
    } catch (error) {
      console.error('Failed to create task:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading project...</Text>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.errorContainer}>
        <Text>Project not found</Text>
      </View>
    );
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.status === 'done').length;

  return (
    <>
      <Stack.Screen 
        options={{ 
          title: project.name,
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')}
            >
              <Ionicons 
                name={viewMode === 'kanban' ? 'list' : 'grid'} 
                size={20} 
                color="#3b82f6" 
              />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <View style={styles.container}>
        <View style={styles.projectHeader}>
          <View style={styles.projectInfo}>
            <Text style={styles.projectTitle}>{project.name}</Text>
            <Text style={styles.projectStats}>
              {completedTasks} of {totalTasks} tasks completed
            </Text>
            <Text style={styles.projectPath}>{project.git_repo_path}</Text>
          </View>
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0)}%
            </Text>
          </View>
        </View>

        {viewMode === 'kanban' ? (
          <ScrollView 
            horizontal
            style={styles.kanbanContainer}
            contentContainerStyle={styles.kanbanContent}
            showsHorizontalScrollIndicator={false}
          >
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                title={column.title}
                status={column.status}
                tasks={tasks}
                onTaskPress={handleTaskPress}
              />
            ))}
          </ScrollView>
        ) : (
          <ScrollView style={styles.listContainer}>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onPress={() => handleTaskPress(task.id)}
              />
            ))}
            {tasks.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={64} color="#9ca3af" />
                <Text style={styles.emptyTitle}>No Tasks Yet</Text>
                <Text style={styles.emptyDescription}>
                  Create your first task to get started
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        <TouchableOpacity 
          style={styles.fab}
          onPress={() => setShowTaskForm(true)}
        >
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>

        <Modal
          visible={showTaskForm}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowTaskForm(false)}
        >
          <TaskForm
            projectId={projectId}
            onSubmit={handleCreateTask}
            onCancel={() => setShowTaskForm(false)}
            showExecutorOptions={true}
          />
        </Modal>
      </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
  projectHeader: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  projectInfo: {
    marginBottom: 16,
  },
  projectTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  projectStats: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  projectPath: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginRight: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    minWidth: 40,
    textAlign: 'right',
  },
  kanbanContainer: {
    flex: 1,
  },
  kanbanContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  listContainer: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    right: 20,
    bottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});