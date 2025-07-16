import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MobileTask, TaskStatus } from '../types';
import TaskCard from './TaskCard';

interface KanbanColumnProps {
  title: string;
  status: TaskStatus;
  tasks: MobileTask[];
  onTaskPress: (taskId: string) => void;
}

const statusColors = {
  todo: '#6b7280',
  inprogress: '#f59e0b',
  inreview: '#8b5cf6',
  done: '#10b981',
  cancelled: '#ef4444',
};

export default function KanbanColumn({ title, status, tasks, onTaskPress }: KanbanColumnProps) {
  const columnTasks = tasks.filter(task => task.status === status);
  const statusColor = statusColors[status];

  return (
    <View style={styles.column}>
      <View style={[styles.header, { backgroundColor: statusColor }]}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.badge}>
          <Text style={styles.count}>{columnTasks.length}</Text>
        </View>
      </View>
      
      <ScrollView 
        style={styles.taskList}
        contentContainerStyle={styles.taskListContent}
        showsVerticalScrollIndicator={false}
      >
        {columnTasks.map((task) => (
          <View key={task.id} style={styles.taskWrapper}>
            <TaskCard 
              task={task} 
              onPress={() => onTaskPress(task.id)} 
            />
          </View>
        ))}
        
        {columnTasks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tasks</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: 280,
    marginRight: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  taskList: {
    flex: 1,
    maxHeight: 600,
  },
  taskListContent: {
    padding: 8,
  },
  taskWrapper: {
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});