import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import KanbanColumn from '../../components/KanbanColumn';
import { MobileTask } from '../../types';

const mockTasks: MobileTask[] = [
  {
    id: '1',
    title: 'Implement user authentication',
    description: 'Add login/logout functionality with JWT tokens',
    status: 'todo',
    projectName: 'Vibe Kanban Mobile',
    createdAt: '2024-07-15T10:00:00Z',
  },
  {
    id: '2',
    title: 'Design mobile interface',
    description: 'Create responsive mobile UI components',
    status: 'inprogress',
    projectName: 'Vibe Kanban Mobile',
    createdAt: '2024-07-14T14:30:00Z',
  },
  {
    id: '3',
    title: 'Set up navigation',
    description: 'Configure React Navigation with tab navigation',
    status: 'inprogress',
    projectName: 'Vibe Kanban Mobile',
    createdAt: '2024-07-13T09:15:00Z',
  },
  {
    id: '4',
    title: 'Create task cards',
    description: 'Design and implement task card components',
    status: 'inreview',
    projectName: 'Vibe Kanban Mobile',
    createdAt: '2024-07-12T16:45:00Z',
  },
  {
    id: '5',
    title: 'Set up project structure',
    description: 'Initialize React Native project with Expo',
    status: 'done',
    projectName: 'Vibe Kanban Mobile',
    createdAt: '2024-07-11T11:20:00Z',
  },
];

const columns = [
  { id: 'todo', title: 'To Do', status: 'todo' as const },
  { id: 'inprogress', title: 'In Progress', status: 'inprogress' as const },
  { id: 'inreview', title: 'In Review', status: 'inreview' as const },
  { id: 'done', title: 'Done', status: 'done' as const },
];

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams();
  const [tasks, setTasks] = useState<MobileTask[]>(mockTasks);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  const handleTaskPress = (taskId: string) => {
    console.log('Task pressed:', taskId);
  };

  const projectName = 'Vibe Kanban Mobile';
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.status === 'done').length;

  return (
    <>
      <Stack.Screen 
        options={{ 
          title: projectName,
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
            <Text style={styles.projectTitle}>{projectName}</Text>
            <Text style={styles.projectStats}>
              {completedTasks} of {totalTasks} tasks completed
            </Text>
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
              <View key={task.id} style={styles.taskWrapper}>
                {/* TaskCard would be used here but we'll keep it simple */}
                <Text>{task.title}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        <TouchableOpacity style={styles.fab}>
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    padding: 16,
  },
  taskWrapper: {
    marginBottom: 8,
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